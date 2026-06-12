const { kv } = require('@vercel/kv');

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      let users = await kv.get('users');
      return res.status(200).json(users || []);
    }
    if (req.method === 'POST') {
      let users = await kv.get('users');
      if (!users) users = [];
      const body = req.body;
      if (body.action === 'register') {
        if (users.find(u => u.email === body.user.email)) {
          return res.status(400).json({ error: 'exists' });
        }
        users.push(body.user);
        await kv.set('users', users);
        return res.status(200).json({ success: true, user: body.user });
      }
      if (body.action === 'login') {
        const user = users.find(u => u.email === body.email && u.pwd === body.pwd);
        if (!user) return res.status(401).json({ error: 'invalid' });
        return res.status(200).json({ success: true, user });
      }
      return res.status(400).json({ error: 'bad action' });
    }
    res.status(405).end();
  } catch(err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
