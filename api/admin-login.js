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

  if (req.method !== 'POST') return res.status(405).end();

  if (!checkRateLimit(ip+':admin-login', 5, 5*60*1000)) {
    return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans 5 minutes.' });
  }

  try {
    const { password } = req.body || {};
    if (!password || typeof password !== 'string' || password.length > 200) {
      return res.status(400).json({ error: 'Requête invalide.' });
    }
    if (password !== process.env.ADMIN_PASSWORD) {
      await new Promise(r => setTimeout(r, 500));
      return res.status(401).json({ error: 'unauthorized' });
    }
    return res.status(200).json({ success: true });
  } catch(err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
}
