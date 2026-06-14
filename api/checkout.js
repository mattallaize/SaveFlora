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

    // Agréger les quantités par produit (au cas où le même produit apparaît plusieurs fois)
    const qtyById = {};
    for (const item of items) {
      const qty = Math.max(1, Math.min(50, parseInt(item.qty) || 1));
      qtyById[item.id] = (qtyById[item.id] || 0) + qty;
    }

    const lineItems = [];
    const cartItemsMeta = [];
    for (const [idStr, qty] of Object.entries(qtyById)) {
      const id = Number(idStr);
      const product = products.find(p => p.id === id);
      if (!product) {
        return res.status(400).json({ error: 'invalid_product' });
      }
      // Vérification du stock côté serveur (si suivi pour ce produit)
      if (product.stock != null && qty > product.stock) {
        return res.status(409).json({ error: 'out_of_stock', product: product.name, available: product.stock });
      }
      lineItems.push({
        price_data: {
          currency: 'eur',
          product_data: { name: product.name },
          unit_amount: Math.round(product.price * 100), // prix venant de la BASE DE DONNÉES, jamais du client
        },
        quantity: qty,
      });
      cartItemsMeta.push({ id, qty });
    }

    // Validation email (utilisé pour Stripe customer_email — optionnel mais pratique)
    const validEmail = typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    // Infos client + panier transmis en métadonnées : le webhook Stripe les récupérera
    // pour créer la commande et décompter le stock de façon sécurisée
    let cartItemsJson = JSON.stringify(cartItemsMeta);
    if (cartItemsJson.length > 480) {
      // Garde-fou pour les paniers très volumineux : on tronque (cas extrêmement rare)
      cartItemsJson = JSON.stringify(cartItemsMeta.slice(0, 10));
    }

    const metadata = {
      customer: String(customer || '').slice(0, 490),
      email: String(email || '').slice(0, 490),
      phone: String(phone || '').slice(0, 490),
      address: String(address || '').slice(0, 490),
      cart_items: cartItemsJson,
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
