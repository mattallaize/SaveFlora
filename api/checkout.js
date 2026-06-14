const Stripe = require('stripe');
const { kv } = require('@vercel/kv');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    const { items, customer, email, phone, address } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'empty_cart' });
    }

    // Récupérer le vrai catalogue produits depuis la base de données
    const products = await kv.get('products') || [];

    const lineItems = [];
    for (const item of items) {
      const product = products.find(p => p.id === item.id);
      if (!product) {
        return res.status(400).json({ error: 'invalid_product' });
      }
      const qty = Math.max(1, Math.min(50, parseInt(item.qty) || 1));
      lineItems.push({
        price_data: {
          currency: 'eur',
          product_data: { name: product.name },
          unit_amount: Math.round(product.price * 100), // prix venant de la BASE DE DONNÉES, jamais du client
        },
        quantity: qty,
      });
    }

    // Validation email (utilisé pour Stripe customer_email — optionnel mais pratique)
    const validEmail = typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    // Infos client transmises en métadonnées : le webhook Stripe les récupérera
    // pour créer la commande de façon sécurisée (le client ne peut pas falsifier le paiement)
    const metadata = {
      customer: String(customer || '').slice(0, 490),
      email: String(email || '').slice(0, 490),
      phone: String(phone || '').slice(0, 490),
      address: String(address || '').slice(0, 490),
    };

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: 'https://saveflora.fr/?success=true&session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://saveflora.fr/?cancelled=true',
      customer_email: validEmail ? email : undefined,
      metadata: metadata,
    });
    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
