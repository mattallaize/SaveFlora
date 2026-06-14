const Stripe = require('stripe');
const { kv } = require('@vercel/kv');
const { Resend } = require('resend');

// Important : on désactive le parsing JSON automatique pour pouvoir vérifier
// la signature Stripe sur le corps brut de la requête.
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
  return `
    <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;color:#1a1010">
      <div style="background:#8B0E1E;padding:2rem;text-align:center">
        <h1 style="color:#E8CC80;font-size:2rem;margin:0;letter-spacing:.2em">SAVEFLORA</h1>
        <p style="color:rgba(255,255,255,.7);margin:.5rem 0 0;font-size:.9rem">Fleurs de Luxe · Marseille</p>
      </div>
      <div style="padding:2rem;background:#FFF5F5">
        <h2 style="color:#B01C2E">Merci ${order.customer || ''} ! 🌹</h2>
        <p>Votre commande a bien été confirmée. Nous la préparerons avec soin.</p>
        <div style="background:white;padding:1.5rem;margin:1.5rem 0;border-top:2px solid #C9A84C">
          <h3 style="color:#C9A84C;font-size:.8rem;letter-spacing:.2em;text-transform:uppercase">Récapitulatif</h3>
          ${order.items.map(i => `<div style="display:flex;justify-content:space-between;padding:.5rem 0;border-bottom:1px solid #F5ECEC"><span>${i.name} × ${i.qty}</span><span style="color:#B01C2E">${(i.price * i.qty).toFixed(2)} €</span></div>`).join('')}
          <div style="display:flex;justify-content:space-between;padding:1rem 0 0;font-size:1.1rem;font-weight:bold"><span>Total</span><span style="color:#B01C2E">${order.total.toFixed(2)} €</span></div>
        </div>
        <div style="background:white;padding:1.5rem;border-top:2px solid #C9A84C">
          <h3 style="color:#C9A84C;font-size:.8rem;letter-spacing:.2em;text-transform:uppercase">Livraison</h3>
          <p style="margin:0">${order.address || ''}</p>
        </div>
        <div style="margin-top:2rem;padding:1.5rem;background:#8B0E1E;border:1px solid #C9A84C;text-align:center">
          <p style="color:white;margin:0 0 1rem">Des questions ? Contactez-nous sur WhatsApp</p>
          <a href="https://wa.me/33676698909" style="background:#C9A84C;color:#1a1010;padding:.8rem 1.5rem;text-decoration:none;font-weight:bold;font-size:.9rem">+33 6 76 69 89 09</a>
        </div>
      </div>
      <div style="background:#1a1010;padding:1rem;text-align:center">
        <p style="color:rgba(255,255,255,.4);font-size:.75rem;margin:0">© 2026 SAVEFLORA · Marseille · <a href="https://www.instagram.com/saveflora13/" style="color:#C9A84C">@saveflora13</a></p>
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

      // Idempotence : si cette session a déjà été traitée (Stripe peut renvoyer le même événement plusieurs fois), on ignore
      if (orders.find(o => o.id === session.id)) {
        return res.status(200).json({ received: true, duplicate: true });
      }

      // Récupérer le détail des articles achetés directement depuis Stripe (fiable, pas falsifiable)
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

      // Décompte automatique du stock pour les produits suivis
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

      // Envoi de l'email de confirmation
      if (order.email) {
        try {
          const resend = new Resend(process.env.RESEND_API_KEY);
          await resend.emails.send({
            from: 'SAVEFLORA <commande@saveflora.fr>',
            to: order.email,
            subject: '🌹 Confirmation de votre commande SAVEFLORA',
            html: emailTemplate(order)
          });
        } catch (emailErr) {
          console.error('Erreur envoi email confirmation:', emailErr);
        }
      }
    } catch (err) {
      console.error('Erreur traitement webhook:', err);
      return res.status(500).json({ error: 'processing_failed' });
    }
  }

  res.status(200).json({ received: true });
};
