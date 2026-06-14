const { put } = require('@vercel/blob');

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

  if (req.headers['x-admin-key'] !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  if (!checkRateLimit(ip+':upload', 30)) {
    return res.status(429).json({ error: 'Trop de requêtes.' });
  }

  try {
    const { filename, dataUrl } = req.body || {};

    if (!filename || !dataUrl || typeof dataUrl !== 'string') {
      return res.status(400).json({ error: 'Données manquantes.' });
    }

    const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) {
      return res.status(400).json({ error: 'Format image invalide.' });
    }

    const mimeType = match[1];
    const base64Data = match[2];
    const buffer = Buffer.from(base64Data, 'base64');

    if (buffer.length > 10 * 1024 * 1024) {
      return res.status(413).json({ error: 'Image trop volumineuse (max 10MB).' });
    }

    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `products/${Date.now()}-${safeName}`;

    const blob = await put(path, buffer, {
      access: 'public',
      contentType: mimeType,
    });

    return res.status(200).json({ success: true, url: blob.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur upload.' });
  }
}
