const { Resend } = require('resend');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { customer, email, items, total, address, orderId } = req.body;

    const itemsHtml = (items || []).map(i =>
      `<tr><td style="padding:12px 0;border-bottom:1px solid #f3f3f3;font-size:14px;color:#2d2d2d;line-height:1.4">${i.name}</td><td style="padding:12px 0;border-bottom:1px solid #f3f3f3;text-align:center;font-size:14px;color:#888">×${i.qty}</td><td style="padding:12px 0;border-bottom:1px solid #f3f3f3;text-align:right;font-size:14px;font-weight:600;color:#2d2d2d;white-space:nowrap">${(i.price * i.qty).toFixed(2)} €</td></tr>`
    ).join('');

    const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;-webkit-font-smoothing:antialiased">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4">
<tr><td align="center" style="padding:48px 20px">
<table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:4px;overflow:hidden">

<tr><td style="padding:40px 48px 32px;border-bottom:1px solid #f0f0f0">
<p style="margin:0 0 24px;font-size:11px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:#bbb">Confirmation de commande</p>
<h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#1a1a1a;line-height:1.3">Votre commande est confirmée</h1>
<p style="margin:0;font-size:15px;color:#777;line-height:1.6">Bonjour ${(customer || '').split(' ')[0]}, merci pour votre achat. Nous avons bien reçu votre commande et allons la traiter dans les plus brefs délais.</p>
</td></tr>

${orderId ? `<tr><td style="padding:24px 48px;background:#fafafa;border-bottom:1px solid #f0f0f0">
<table width="100%" cellpadding="0" cellspacing="0"><tr>
<td><p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#bbb">Référence</p>
<p style="margin:0;font-size:15px;font-weight:700;color:#1a1a1a;font-family:'Courier New',monospace">#${String(orderId).slice(-10).toUpperCase()}</p></td>
<td style="text-align:right"><p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#bbb">Date</p>
<p style="margin:0;font-size:14px;color:#555">${new Date().toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' })}</p></td>
</tr></table>
</td></tr>` : ''}

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
<td style="padding:16px 0 0;text-align:right;font-size:17px;font-weight:700;color:#1a1a1a">${Number(total).toFixed(2)} €</td>
</tr>
</table>
</td></tr>

<tr><td style="padding:0 48px 32px">
<p style="margin:0 0 8px;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#bbb">Adresse de livraison</p>
<p style="margin:0;font-size:14px;color:#555;line-height:1.7;padding:16px;background:#fafafa;border-radius:4px;border-left:3px solid #e8e8e8">${address || ''}</p>
</td></tr>

<tr><td style="padding:0 48px 32px">
<p style="margin:0;font-size:14px;color:#888;line-height:1.8;padding:16px 20px;background:#f9f9f9;border-radius:4px">
📦 Vous recevrez un email de suivi dès l'expédition de votre commande.<br>
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

    await resend.emails.send({
      from: 'Commandes <commande@saveflora.fr>',
      to: email,
      subject: 'Confirmation de votre commande',
      html
    });

    res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
