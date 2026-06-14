const { kv } = require('@vercel/kv');

module.exports = async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    if (req.method === 'GET') {
      if (req.headers['x-admin-key'] !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'unauthorized' });
      }
      const orders = await kv.get('orders') || [];
      return res.status(200).json(orders);
    }
    if (req.method === 'POST') {
      // Réservé à l'admin (création manuelle éventuelle). Les vraies commandes
      // sont créées automatiquement par le webhook Stripe (api/stripe-webhook.js)
      // après vérification du paiement — jamais directement depuis le navigateur.
      if (req.headers['x-admin-key'] !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'unauthorized' });
      }
      const order = req.body;
      if (!order || !order.id || !order.customer || !order.email || order.total === undefined) {
        return res.status(400).json({ error: 'Commande invalide.' });
      }
      let orders = await kv.get('orders') || [];
      orders.unshift(order);
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
