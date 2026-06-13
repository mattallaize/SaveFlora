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
      const list = await kv.get('newsletter') || [];
      return res.status(200).json(list);
    }

    if (req.method === 'POST') {
      // Rate limit strict : max 3 inscriptions par IP par minute
      if (!checkRateLimit(ip + ':newsletter', 3)) {
        return res.status(429).json({ error: 'Trop de requêtes.' });
      }
      if (!validateBodySize(req.body, 5)) {
        return res.status(413).json({ error: 'Données invalides.' });
      }
      const { email } = req.body;
      // Validation email stricte
      if (!email || typeof email !== 'string' || email.length > 254 ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Email invalide.' });
      }
      let list = await kv.get('newsletter') || [];
      if (list.find(s => s.email.toLowerCase() === email.toLowerCase())) {
        return res.status(200).json({ success: true, alreadySubscribed: true });
      }
      // Limite de 10 000 inscrits max
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
