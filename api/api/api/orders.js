const { kv } = require('@vercel/kv');

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      let orders = await kv.get('orders');
      return res.status(200).json(orders || []);
    }
    if (req.method === 'POST') {
      let orders = await kv.get('orders');
      if (!orders) orders = [];
      orders.unshift(req.body);
      await kv.set('orders', orders);
      return res.status(200).json({ success: true });
    }
    res.status(405).end();
  } catch(err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
