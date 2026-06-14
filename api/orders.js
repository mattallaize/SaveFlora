const { kv } = require('@vercel/kv');

const rateLimitStore = new Map();
function checkRateLimit(key, max, windowMs) {
  windowMs = windowMs || 60000;
  const now = Date.now();
  if (!rateLimitStore.has(key)) { rateLimitStore.set(key, { count: 1, resetAt: now + windowMs }); return true; }
  const entry = rateLimitStore.get(key);
  if (now > entry.resetAt) { rateLimitStore.set(key, { count: 1, resetAt: now + windowMs }); return true; }
  entry.count++;
  return entry.count <= max;
}
function getClientIp(req) {
  return (req.headers['x-forwarded-for']||'').split(',')[0].trim() || 'unknown';
}

module.exports = async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const ip = getClientIp(req);
  try {
    if (req.method === 'GET') {
      if (req.headers['x-admin-key'] !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'unauthorized' });
      }
      const orders = await kv.get('orders') || [];
      return res.status(200).json(orders);
    }
    if (req.method === 'POST') {
      if (!checkRateLimit(ip+':orders:post', 10)) {
        return res.status(429).json({ error: 'Trop de requêtes.' });
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
