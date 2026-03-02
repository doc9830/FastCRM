const router = require('express').Router();
const pool = require('../config/database');
const logger = require('../utils/logger');
const { validateClient } = require('../middleware/validate');

// BUG-009: pagination helper
function paginate(req) {
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

router.get('/', async (req, res) => {
  try {
    const { search, phone } = req.query;
    const { page, limit, offset } = paginate(req);

    const params = [];
    let where = '';

    if (search) {
      params.push(`%${search}%`);
      where = ' WHERE name ILIKE $1 OR phone ILIKE $1 OR note ILIKE $1 OR email ILIKE $1';
    } else if (phone) {
      params.push(phone);
      where = ' WHERE phone = $1';
    }

    // Count total for pagination meta
    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM clients${where}`, params
    );
    const total = parseInt(countResult.rows[0].count) || 0;

    params.push(limit, offset);
    const result = await pool.query(
      `SELECT * FROM clients${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ data: result.rows, total, page, limit });
  } catch (err) {
    logger.error('Clients GET error', { err });
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM clients WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Client not found' });
    res.json(result.rows[0]);
  } catch (err) {
    logger.error('Clients GET/:id error', { err });
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', validateClient, async (req, res) => {
  try {
    const { name, phone, note, email } = req.body;
    const result = await pool.query(
      'INSERT INTO clients (name, phone, note, email) VALUES ($1, $2, $3, $4) RETURNING *',
      [name.trim(), phone.trim(), note || null, email ? email.trim() : null]
    );
    logger.info('Client created', { actorId: req.user?.id, name });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    logger.error('Clients POST error', { err });
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', validateClient, async (req, res) => {
  try {
    const { name, phone, note, email } = req.body;
    const check = await pool.query('SELECT id FROM clients WHERE id = $1', [req.params.id]);
    if (!check.rows[0]) return res.status(404).json({ error: 'Client not found' });

    // BUG-017: explicitly set updated_at (SQLite has no trigger)
    await pool.query(
      `UPDATE clients SET name=$1, phone=$2, note=$3, email=$4, updated_at=NOW() WHERE id=$5`,
      [name.trim(), phone.trim(), note || null, email ? email.trim() : null, req.params.id]
    );
    const updated = await pool.query('SELECT * FROM clients WHERE id = $1', [req.params.id]);
    logger.info('Client updated', { actorId: req.user?.id, clientId: req.params.id });
    res.json(updated.rows[0]);
  } catch (err) {
    logger.error('Clients PUT error', { err });
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const check = await pool.query('SELECT id FROM clients WHERE id = $1', [req.params.id]);
    if (!check.rows[0]) return res.status(404).json({ error: 'Client not found' });
    await pool.query('DELETE FROM clients WHERE id = $1', [req.params.id]);
    logger.info('Client deleted', { actorId: req.user?.id, clientId: req.params.id });
    res.json({ message: 'Client deleted' });
  } catch (err) {
    logger.error('Clients DELETE error', { err });
    res.status(500).json({ error: 'Server error' });
  }
});

// BUG-010: N+1 fix — single JOIN query for client orders with items
router.get('/:id/orders', async (req, res) => {
  try {
    const ordersResult = await pool.query(
      `SELECT o.* FROM orders o WHERE o.client_id = $1 ORDER BY o.created_at DESC`,
      [req.params.id]
    );
    if (ordersResult.rows.length === 0) return res.json([]);

    const orderIds = ordersResult.rows.map(o => o.id);

    // Single query for all items (BUG-010)
    const itemsResult = await pool.query(
      `SELECT oi.id, oi.order_id, oi.product_id, oi.quantity, oi.price, p.name as product_name
       FROM order_items oi
       LEFT JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = ANY($1::int[])
       ORDER BY oi.id ASC`,
      [orderIds]
    );
    const itemsByOrder = {};
    for (const item of itemsResult.rows) {
      (itemsByOrder[item.order_id] ||= []).push(item);
    }

    const orders = ordersResult.rows.map(order => ({
      ...order,
      items: itemsByOrder[order.id] || [],
    }));

    res.json(orders);
  } catch (err) {
    logger.error('Clients GET/:id/orders error', { err });
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
