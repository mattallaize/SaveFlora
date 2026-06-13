const { kv } = require('@vercel/kv');
const { checkRateLimit, getClientIp, validateBodySize, setSecurityHeaders } = require('./security');

module.exports = async function handler(req, res) {
  setSecurityHeaders(res);
  const ip = getClientIp(req);

  try {
    if (req.method === 'GET') {
      if (req.headers['x-admin-key'] !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'unauthorized' });
      }
      if (!checkRateLimit(ip + ':orders:get', 30)) {
        return res.status(429).json({ error: 'Trop de requêtes.' });
      }
      const orders = await kv.get('orders') || [];
      return res.status(200).json(orders);
    }

    if (req.method === 'POST') {
      // Rate limit : max 5 commandes par IP par minute (anti-spam)
      if (!checkRateLimit(ip + ':orders:post', 5)) {
        return res.status(429).json({ error: 'Trop de requêtes.' });
      }
      // Validation taille max 50Ko pour une commande
      if (!validateBodySize(req.body, 50)) {
        return res.status(413).json({ error: 'Données trop volumineuses.' });
      }
      const order = req.body;
      // Validation champs obligatoires
      if (!order.id || !order.customer || !order.email || !order.total) {
        return res.status(400).json({ error: 'Commande invalide.' });
      }
      let orders = await kv.get('orders') || [];
      orders.unshift(order);
      // Garder max 500 commandes en base
      if (orders.length > 500) orders = orders.slice(0, 500);
      await kv.set('orders', orders);
      return res.status(200).json({ success: true });
    }

    res.status(405).end();
  } catch(err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
}
