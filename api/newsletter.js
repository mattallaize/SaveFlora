const { kv } = require('@vercel/kv');

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      if (req.headers['x-admin-key'] !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'unauthorized' });
      }
      const list = await kv.get('newsletter') || [];
      return res.status(200).json(list);
    }
    if (req.method === 'POST') {
      const { email } = req.body;
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'invalid_email' });
      }
      let list = await kv.get('newsletter') || [];
      if (list.find(s => s.email.toLowerCase() === email.toLowerCase())) {
        return res.status(200).json({ success: true, alreadySubscribed: true });
      }
      list.push({ email, date: new Date().toLocaleString('fr-FR') });
      await kv.set('newsletter', list);
      return res.status(200).json({ success: true });
    }
    res.status(405).end();
  } catch(err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
