const { kv } = require('@vercel/kv');

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      let products = await kv.get('products');
      return res.status(200).json(products || null);
    }
    if (req.method === 'POST') {
      await kv.set('products', req.body);
      return res.status(200).json({ success: true });
    }
    res.status(405).end();
  } catch(err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
