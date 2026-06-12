const { kv } = require('@vercel/kv');
const crypto = require('crypto');

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      if (req.headers['x-admin-key'] !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'unauthorized' });
      }
      let users = await kv.get('users');
      const safe = (users||[]).map(u => { const {pwd, salt, hash, ...rest} = u; return rest; });
      return res.status(200).json(safe);
    }
    if (req.method === 'POST') {
      let users = await kv.get('users');
      if (!users) users = [];
      const body = req.body;

      if (body.action === 'register') {
        if (users.find(u => u.email === body.user.email)) {
          return res.status(400).json({ error: 'exists' });
        }
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = hashPassword(body.user.pwd, salt);
        const { pwd, ...rest } = body.user;
        const userToStore = { ...rest, salt, hash };
        users.push(userToStore);
        await kv.set('users', users);
        const { salt: _s, hash: _h, ...safeUser } = userToStore;
        return res.status(200).json({ success: true, user: safeUser });
      }

      if (body.action === 'login') {
        const user = users.find(u => u.email === body.email);
        if (!user) return res.status(401).json({ error: 'invalid' });

        if (user.hash && user.salt) {
          const hash = hashPassword(body.pwd, user.salt);
          if (hash !== user.hash) return res.status(401).json({ error: 'invalid' });
        } else if (user.pwd) {
          // Ancien compte non chiffré -> on vérifie puis on migre
          if (user.pwd !== body.pwd) return res.status(401).json({ error: 'invalid' });
          const salt = crypto.randomBytes(16).toString('hex');
          user.hash = hashPassword(body.pwd, salt);
          user.salt = salt;
          delete user.pwd;
          await kv.set('users', users);
        } else {
          return res.status(401).json({ error: 'invalid' });
        }

        const { salt: _s, hash: _h, pwd: _p, ...safeUser } = user;
        return res.status(200).json({ success: true, user: safeUser });
      }

      return res.status(400).json({ error: 'bad action' });
    }
    res.status(405).end();
  } catch(err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
