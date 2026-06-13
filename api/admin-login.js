const { checkRateLimit, getClientIp, setSecurityHeaders } = require('./security');

module.exports = async function handler(req, res) {
  setSecurityHeaders(res);
  const ip = getClientIp(req);

  if (req.method !== 'POST') return res.status(405).end();

  // Rate limit très strict : max 5 tentatives par IP par 5 minutes
  if (!checkRateLimit(ip + ':admin-login', 5, 5 * 60 * 1000)) {
    return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans 5 minutes.' });
  }

  try {
    const { password } = req.body;
    if (!password || typeof password !== 'string' || password.length > 200) {
      return res.status(400).json({ error: 'Requête invalide.' });
    }
    if (password !== process.env.ADMIN_PASSWORD) {
      // Délai artificiel de 500ms pour ralentir le bruteforce
      await new Promise(r => setTimeout(r, 500));
      return res.status(401).json({ error: 'unauthorized' });
    }
    return res.status(200).json({ success: true });
  } catch(err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
}
