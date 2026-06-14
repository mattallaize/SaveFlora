const { kv } = require('@vercel/kv');
const crypto = require('crypto');
const { Resend } = require('resend');

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
}

function verifyPassword(user, pwd) {
  if (user.hash && user.salt) {
    return hashPassword(pwd, user.salt) === user.hash;
  } else if (user.pwd) {
    return user.pwd === pwd;
  }
  return false;
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      if (req.headers['x-admin-key'] !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'unauthorized' });
      }
      let users = await kv.get('users');
      const safe = (users||[]).map(u => { const {pwd, salt, hash, resetToken, resetExpires, ...rest} = u; return rest; });
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
        const { salt: _s, hash: _h, pwd: _p, resetToken: _rt, resetExpires: _re, ...safeUser } = user;
        return res.status(200).json({ success: true, user: safeUser });
      }

      // Récupération de l'historique de commandes d'un client.
      // On revérifie email+mot de passe (pas de jeton de session existant)
      // pour éviter qu'un email connu suffise à consulter les commandes de quelqu'un d'autre.
      if (body.action === 'get-orders') {
        const user = users.find(u => u.email === body.email);
        if (!user || !verifyPassword(user, body.pwd)) {
          return res.status(401).json({ error: 'invalid' });
        }
        const orders = await kv.get('orders') || [];
        const myOrders = orders
          .filter(o => o.email && o.email.toLowerCase() === body.email.toLowerCase())
          .map(o => ({ id: o.id, date: o.date, items: o.items, total: o.total, status: o.status || 'pending' }));
        return res.status(200).json({ success: true, orders: myOrders });
      }

      if (body.action === 'forgot-password') {
        const user = users.find(u => u.email === body.email);
        // Toujours répondre "success" même si l'email n'existe pas (sécurité : ne pas révéler les comptes existants)
        if (!user) return res.status(200).json({ success: true });

        const token = crypto.randomBytes(32).toString('hex');
        user.resetToken = token;
        user.resetExpires = Date.now() + 60 * 60 * 1000; // 1 heure
        await kv.set('users', users);

        const resetUrl = `https://saveflora.fr/?reset=${token}&email=${encodeURIComponent(user.email)}`;

        try {
          const resend = new Resend(process.env.RESEND_API_KEY);
          await resend.emails.send({
            from: 'SAVEFLORA <commande@saveflora.fr>',
            to: user.email,
            subject: '🔐 Réinitialisation de votre mot de passe SAVEFLORA',
            html: `
              <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;color:#1a1010">
                <div style="background:#8B0E1E;padding:2rem;text-align:center">
                  <h1 style="color:#E8CC80;font-size:2rem;margin:0;letter-spacing:.2em">SAVEFLORA</h1>
                  <p style="color:rgba(255,255,255,.7);margin:.5rem 0 0;font-size:.9rem">Fleurs de Luxe · Marseille</p>
                </div>
                <div style="padding:2rem;background:#FFF5F5">
                  <h2 style="color:#B01C2E">Réinitialisation de mot de passe</h2>
                  <p>Bonjour ${user.firstName||''},</p>
                  <p>Vous avez demandé à réinitialiser votre mot de passe. Cliquez sur le bouton ci-dessous (lien valable 1 heure) :</p>
                  <div style="text-align:center;margin:2rem 0">
                    <a href="${resetUrl}" style="background:#C9A84C;color:#1a1010;padding:1rem 2rem;text-decoration:none;font-weight:bold;font-size:.9rem;letter-spacing:.1em;text-transform:uppercase;display:inline-block">Choisir un nouveau mot de passe</a>
                  </div>
                  <p style="font-size:.85rem;color:#7A5A5A">Si vous n'avez pas demandé cette réinitialisation, ignorez simplement cet email — votre mot de passe ne sera pas modifié.</p>
                </div>
                <div style="background:#1a1010;padding:1rem;text-align:center">
                  <p style="color:rgba(255,255,255,.4);font-size:.75rem;margin:0">© 2026 SAVEFLORA · Marseille</p>
                </div>
              </div>
            `
          });
        } catch(emailErr) {
          console.error('Email reset error:', emailErr);
        }
        return res.status(200).json({ success: true });
      }

      if (body.action === 'reset-password') {
        const { email, token, newPwd } = body;
        const user = users.find(u => u.email === email);
        if (!user || !user.resetToken || user.resetToken !== token) {
          return res.status(400).json({ error: 'invalid_token' });
        }
        if (!user.resetExpires || Date.now() > user.resetExpires) {
          return res.status(400).json({ error: 'expired_token' });
        }
        if (!newPwd || newPwd.length < 6) {
          return res.status(400).json({ error: 'weak_password' });
        }
        const salt = crypto.randomBytes(16).toString('hex');
        user.hash = hashPassword(newPwd, salt);
        user.salt = salt;
        delete user.pwd;
        delete user.resetToken;
        delete user.resetExpires;
        await kv.set('users', users);
        return res.status(200).json({ success: true });
      }

      return res.status(400).json({ error: 'bad action' });
    }
    res.status(405).end();
  } catch(err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
