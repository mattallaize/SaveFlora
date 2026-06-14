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
      const list = await kv.get('newsletter') || [];
      return res.status(200).json(list);
    }
    if (req.method === 'POST') {
      if (!checkRateLimit(ip+':newsletter', 5)) {
        return res.status(429).json({ error: 'Trop de requêtes.' });
      }
      const { email } = req.body || {};
      if (!email || typeof email !== 'string' || email.length > 254 ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Email invalide.' });
      }
      let list = await kv.get('newsletter') || [];
      if (list.find(s => s.email.toLowerCase() === email.toLowerCase())) {
        return res.status(200).json({ success: true, alreadySubscribed: true });
      }
      if (list.length >= 10000) {
        return res.status(200).json({ success: true });
      }
      list.push({ email: email.toLowerCase().trim(), date: new Date().toLocaleString('fr-FR') });
      await kv.set('newsletter', list);
      return res.status(200).json({ success: true });
    }
    res.status(405).end();
  } catch(err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
}
