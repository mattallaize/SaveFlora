const { kv } = require('@vercel/kv');

const VALID_STATUSES = ['pending', 'preparing', 'delivered'];

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

    if (req.method === 'PATCH') {
      // Mise à jour du statut d'une commande (admin uniquement)
      if (req.headers['x-admin-key'] !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'unauthorized' });
      }
      const { id, status } = req.body || {};
      if (!id || !VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: 'invalid_request' });
      }
      let orders = await kv.get('orders') || [];
      const order = orders.find(o => o.id === id);
      if (!order) {
        return res.status(404).json({ error: 'not_found' });
      }
      order.status = status;
      await kv.set('orders', orders);
      return res.status(200).json({ success: true });
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
      if (!order.status) order.status = 'pending';
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
