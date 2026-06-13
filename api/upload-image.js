const { put } = require('@vercel/blob');
const { checkRateLimit, getClientIp, setSecurityHeaders } = require('./security');

module.exports = async function handler(req, res) {
  setSecurityHeaders(res);
  const ip = getClientIp(req);

  if (req.method !== 'POST') return res.status(405).end();

  // Protection : seul l'admin peut uploader des images
  if (req.headers['x-admin-key'] !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  // Rate limit : max 30 uploads par minute (large pour permettre uploads multiples)
  if (!checkRateLimit(ip + ':upload', 30)) {
    return res.status(429).json({ error: 'Trop de requêtes.' });
  }

  try {
    const { filename, dataUrl } = req.body;

    if (!filename || !dataUrl || typeof dataUrl !== 'string') {
      return res.status(400).json({ error: 'Données manquantes.' });
    }

    // Extraire le base64 du data URL (format: data:image/jpeg;base64,XXXXX)
    const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) {
      return res.status(400).json({ error: 'Format image invalide.' });
    }

    const mimeType = match[1];
    const base64Data = match[2];
    const buffer = Buffer.from(base64Data, 'base64');

    // Limite : 10MB max par image
    if (buffer.length > 10 * 1024 * 1024) {
      return res.status(413).json({ error: 'Image trop volumineuse (max 10MB).' });
    }

    // Nettoyer le nom de fichier et ajouter un timestamp pour éviter les collisions
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
