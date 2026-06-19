const Stripe = require('stripe');
const { kv } = require('@vercel/kv');
const { Resend } = require('resend');

module.exports.config = {
  api: { bodyParser: false }
};

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function emailTemplate(order) {
  const itemsHtml = order.items.map(i =>
    `<tr><td style="padding:12px 0;border-bottom:1px solid #f3f3f3;font-size:14px;color:#2d2d2d;line-height:1.4">${i.name}</td><td style="padding:12px 0;border-bottom:1px solid #f3f3f3;text-align:center;font-size:14px;color:#888">×${i.qty}</td><td style="padding:12px 0;border-bottom:1px solid #f3f3f3;text-align:right;font-size:14px;font-weight:600;color:#2d2d2d;white-space:nowrap">${(i.price * i.qty).toFixed(2)} €</td></tr>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;-webkit-font-smoothing:antialiased">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4">
<tr><td align="center" style="padding:48px 20px">
<table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:4px;overflow:hidden">

<tr><td style="padding:40px 48px 32px;border-bottom:1px solid #f0f0f0">
<p style="margin:0 0 24px;font-size:11px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:#bbb">Confirmation de commande</p>
<h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#1a1a1a;line-height:1.3">Votre commande est confirmée</h1>
<p style="margin:0;font-size:15px;color:#777;line-height:1.6">Bonjour ${(order.customer || '').split(' ')[0]}, merci pour votre achat. Nous avons bien reçu votre commande et allons la traiter dans les plus brefs délais.</p>
</td></tr>

<tr><td style="padding:24px 48px;background:#fafafa;border-bottom:1px solid #f0f0f0">
<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td><p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#bbb">Référence</p>
<p style="margin:0;font-size:15px;font-weight:700;color:#1a1a1a;font-family:'Courier New',monospace">#${order.id.slice(-10).toUpperCase()}</p></td>
<td style="text-align:right"><p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#bbb">Date</p>
<p style="margin:0;font-size:14px;color:#555">${new Date().toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' })}</p></td>
</tr>
</table>
</td></tr>

<tr><td style="padding:32px 48px">
<p style="margin:0 0 16px;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#bbb">Récapitulatif</p>
<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<th style="text-align:left;padding:0 0 12px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#bbb;border-bottom:1px solid #f0f0f0">Article</th>
<th style="text-align:center;padding:0 0 12px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#bbb;border-bottom:1px solid #f0f0f0">Qté</th>
<th style="text-align:right;padding:0 0 12px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#bbb;border-bottom:1px solid #f0f0f0">Prix</th>
</tr>
${itemsHtml}
<tr>
<td colspan="2" style="padding:16px 0 0;font-size:15px;font-weight:700;color:#1a1a1a">Total payé</td>
<td style="padding:16px 0 0;text-align:right;font-size:17px;font-weight:700;color:#1a1a1a">${order.total.toFixed(2)} €</td>
</tr>
</table>
</td></tr>

<tr><td style="padding:0 48px 32px">
<p style="margin:0 0 8px;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#bbb">Adresse de livraison</p>
<p style="margin:0;font-size:14px;color:#555;line-height:1.7;padding:16px;background:#fafafa;border-radius:4px;border-left:3px solid #e8e8e8">${order.address || ''}</p>
</td></tr>

<tr><td style="padding:0 48px 32px">
<p style="margin:0;font-size:14px;color:#888;line-height:1.8;padding:16px 20px;background:#f9f9f9;border-radius:4px">
📦 Vous recevrez un email de suivi dès l'expédition de votre colis.<br>
⏱ Délai estimé : <strong style="color:#555">3 à 7 jours ouvrés</strong>
</p>
</td></tr>

<tr><td style="padding:24px 48px;border-top:1px solid #f0f0f0">
<p style="margin:0;font-size:13px;color:#aaa;line-height:1.6">Une question ? Répondez directement à cet email, nous vous répondrons sous 24h.</p>
</td></tr>

<tr><td style="padding:20px 48px;background:#fafafa;border-top:1px solid #f0f0f0">
<p style="margin:0;font-size:11px;color:#ccc">© ${new Date().getFullYear()} — Tous droits réservés</p>
</td></tr>

</table>
</td></tr>
</table>
</body></html>`;
}

function adminNotificationTemplate(order) {
  return `
    <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;color:#1a1010">
      <div style="background:#1A1010;padding:1.5rem 2rem">
        <h2 style="color:#E8CC80;margin:0;font-size:1.3rem">🌹 Nouvelle commande SAVEFLORA</h2>
      </div>
      <div style="padding:1.5rem 2rem;background:#FFF5F5">
        <p style="font-size:1.1rem;margin:0 0 1rem"><strong>${order.total.toFixed(2)} €</strong> — ${order.customer || 'Client'}</p>
        <table style="width:100%;font-size:.9rem;border-collapse:collapse">
          <tr><td style="padding:.3rem 0;color:#7A5A5A;width:100px">Email</td><td>${order.email || '-'}</td></tr>
          <tr><td style="padding:.3rem 0;color:#7A5A5A">Téléphone</td><td>${order.phone || '-'}</td></tr>
          <tr><td style="padding:.3rem 0;color:#7A5A5A;vertical-align:top">Adresse</td><td>${order.address || '-'}</td></tr>
        </table>
        <div style="background:white;padding:1rem;margin-top:1rem;border-top:2px solid #C9A84C">
          ${order.items.map(i => `<div style="display:flex;justify-content:space-between;padding:.3rem 0;border-bottom:1px solid #F5ECEC;font-size:.9rem"><span>${i.name} × ${i.qty}</span><span>${(i.price * i.qty).toFixed(2)} €</span></div>`).join('')}
        </div>
        <p style="margin-top:1.5rem"><a href="https://saveflora.fr/?gestion=fleur2026" style="background:#B01C2E;color:white;padding:.7rem 1.3rem;text-decoration:none;font-size:.85rem">Voir dans l'admin →</a></p>
      </div>
    </div>
  `;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers['stripe-signature'];
  let rawBody;
  try {
    rawBody = await getRawBody(req);
  } catch (e) {
    return res.status(400).send('Erreur lecture body');
  }
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Signature webhook invalide:', err.message);
    return res.status(400).send('Signature invalide');
  }
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    try {
      let orders = await kv.get('orders') || [];
      if (orders.find(o => o.id === session.id)) {
        return res.status(200).json({ received: true, duplicate: true });
      }
      const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 });
      const items = lineItems.data.map(li => ({
        name: li.description,
        qty: li.quantity,
        price: li.price && li.price.unit_amount ? (li.price.unit_amount / 100) : (li.amount_total / 100 / li.quantity)
      }));
      const meta = session.metadata || {};
      const order = {
        id: session.id,
        date: new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }),
        customer: meta.customer || '',
        email: meta.email || (session.customer_details && session.customer_details.email) || '',
        phone: meta.phone || '',
        address: meta.address || '',
        items,
        total: (session.amount_total / 100),
        status: 'pending'
      };
      orders.unshift(order);
      if (orders.length > 500) orders = orders.slice(0, 500);
      await kv.set('orders', orders);

      // Décompte stock
      try {
        let cartItems = [];
        if (meta.cart_items) {
          try { cartItems = JSON.parse(meta.cart_items); } catch (e) { cartItems = []; }
        }
        if (Array.isArray(cartItems) && cartItems.length) {
          const allProducts = await kv.get('products') || [];
          let changed = false;
          for (const ci of cartItems) {
            const product = allProducts.find(p => p.id === ci.id);
            if (product && product.stock != null) {
              product.stock = Math.max(0, product.stock - (ci.qty || 0));
              changed = true;
            }
          }
          if (changed) await kv.set('products', allProducts);
        }
      } catch (stockErr) {
        console.error('Erreur décompte stock:', stockErr);
      }

      // Email client
      if (order.email) {
        try {
          const resend = new Resend(process.env.RESEND_API_KEY);
          await resend.emails.send({
            from: 'Commandes <commande@saveflora.fr>',
            to: order.email,
            subject: 'Confirmation de votre commande',
            html: emailTemplate(order)
          });
        } catch (emailErr) {
          console.error('Erreur envoi email confirmation:', emailErr);
        }
      }

      // Notif admin
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: 'Commandes <commande@saveflora.fr>',
          to: 'saveflora13@gmail.com',
          subject: `🌹 Nouvelle commande — ${order.customer || 'Client'} — ${order.total.toFixed(2)} €`,
          html: adminNotificationTemplate(order)
        });
      } catch (adminEmailErr) {
        console.error('Erreur envoi email notification admin:', adminEmailErr);
      }
    } catch (err) {
      console.error('Erreur traitement webhook:', err);
      return res.status(500).json({ error: 'processing_failed' });
    }
  }
  res.status(200).json({ received: true });
};
