const { Resend } = require('resend');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { customer, email, items, total, address } = req.body;

    await resend.emails.send({
      from: 'SAVEFLORA <onboarding@resend.dev>',
      to: email,
      subject: '🌹 Confirmation de votre commande SAVEFLORA',
      html: `
        <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;color:#1a1010">
          <div style="background:#8B0E1E;padding:2rem;text-align:center">
            <h1 style="color:#E8CC80;font-size:2rem;margin:0;letter-spacing:.2em">SAVEFLORA</h1>
            <p style="color:rgba(255,255,255,.7);margin:.5rem 0 0;font-size:.9rem">Fleurs de Luxe · Marseille</p>
          </div>
          <div style="padding:2rem;background:#FFF5F5">
            <h2 style="color:#B01C2E">Merci ${customer} ! 🌹</h2>
            <p>Votre commande a bien été confirmée. Nous la préparerons avec soin.</p>
            <div style="background:white;padding:1.5rem;margin:1.5rem 0;border-top:2px solid #C9A84C">
              <h3 style="color:#C9A84C;font-size:.8rem;letter-spacing:.2em;text-transform:uppercase">Récapitulatif</h3>
              ${items.map(i => `<div style="display:flex;justify-content:space-between;padding:.5rem 0;border-bottom:1px solid #F5ECEC"><span>${i.name} × ${i.qty}</span><span style="color:#B01C2E">${i.price * i.qty} €</span></div>`).join('')}
              <div style="display:flex;justify-content:space-between;padding:1rem 0 0;font-size:1.1rem;font-weight:bold"><span>Total</span><span style="color:#B01C2E">${total} €</span></div>
            </div>
            <div style="background:white;padding:1.5rem;border-top:2px solid #C9A84C">
              <h3 style="color:#C9A84C;font-size:.8rem;letter-spacing:.2em;text-transform:uppercase">Livraison</h3>
              <p style="margin:0">${address}</p>
            </div>
            <div style="margin-top:2rem;padding:1.5rem;background:#075e54;text-align:center">
              <p style="color:white;margin:0 0 1rem">Des questions ? Contactez-nous sur WhatsApp</p>
              <a href="https://wa.me/33676698909" style="background:#25D366;color:#075e54;padding:.8rem 1.5rem;text-decoration:none;font-weight:bold;font-size:.9rem">+33 6 76 69 89 09</a>
            </div>
          </div>
          <div style="background:#1a1010;padding:1rem;text-align:center">
            <p style="color:rgba(255,255,255,.4);font-size:.75rem;margin:0">© 2024 SAVEFLORA · Marseille · <a href="https://www.instagram.com/saveflora13/" style="color:#C9A84C">@saveflora13</a></p>
          </div>
        </div>
      `
    });

    res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
