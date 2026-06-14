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
      if (!checkRateLimit(ip+':products:get', 60)) {
        return res.status(429).json({ error: 'Trop de requêtes.' });
      }
      const products = await kv.get('products') || [];
      return res.status(200).json(products);
    }
    if (req.method === 'POST') {
      if (req.headers['x-admin-key'] !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'unauthorized' });
      }
      const products = req.body;
      if (!Array.isArray(products)) {
        return res.status(400).json({ error: 'Format invalide.' });
      }
      await kv.set('products', products);
      return res.status(200).json({ success: true });
    }
    res.status(405).end();
  } catch(err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
}
