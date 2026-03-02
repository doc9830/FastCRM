const router = require('express').Router();
const pool = require('../config/database');
const logger = require('../utils/logger');
const { logStockHistory } = require('../models/stockHistory');
const { notifyOrderCreated, notifyOrderStatusChanged } = require('../utils/telegramNotifier');

const ORDER_STATUSES = [
  { value: 'new',         label: 'Новый',    color: '#4f6ef7' },
  { value: 'in_progress', label: 'В работе', color: '#f59e0b' },
  { value: 'ready',       label: 'Готов',    color: '#10b981' },
  { value: 'cancelled',   label: 'Отменён',  color: '#ef4444' },
];
const VALID_STATUSES = ORDER_STATUSES.map(s => s.value);

// BUG-009: pagination helper
function paginate(req) {
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
  return { page, limit, offset: (page - 1) * limit };
}

// BUG-010: Build full orders with items using a single query
// PostgreSQL: WHERE order_id = ANY($1::int[])
// SQLite: adapter auto-expands ANY(array) → IN (?, ?, ...)
async function buildFullOrders(orderRows) {
  if (!orderRows.length) return [];
  const orderIds = orderRows.map(o => o.id);
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
  return orderRows.map(o => ({ ...o, items: itemsByOrder[o.id] || [] }));
}

async function getFullOrder(id) {
  const result = await pool.query(
    `SELECT o.*,
       c.name as client_name, c.phone as client_phone,
       u.name as created_by_name, u.username as created_by_username
     FROM orders o
     LEFT JOIN clients c ON o.client_id = c.id
     LEFT JOIN users u ON o.created_by = u.id
     WHERE o.id = $1`,
    [id]
  );
  if (!result.rows[0]) return null;
  const [full] = await buildFullOrders([result.rows[0]]);
  return full;
}

async function restoreOrderStock(db, orderId, actorUserId = null) {
  const existingItems = await db.query(
    `SELECT oi.product_id, oi.quantity, p.type, p.stock_quantity
     FROM order_items oi
     JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = $1`,
    [orderId]
  );
  for (const item of existingItems.rows) {
    if (item.type !== 'product') continue;
    const nextStock = Number(item.stock_quantity || 0) + Number(item.quantity);
    await db.query('UPDATE products SET stock_quantity = stock_quantity + $1 WHERE id = $2',
      [item.quantity, item.product_id]);
    await logStockHistory(db, {
      productId: item.product_id, actionType: 'order_restore',
      quantity: Number(item.quantity), balanceAfter: nextStock,
      actorUserId, payload: { orderId },
    });
  }
}

async function deductOrderStock(db, orderId, actorUserId = null) {
  const existingItems = await db.query(
    `SELECT oi.product_id, oi.quantity, p.type, p.stock_quantity, p.name
     FROM order_items oi
     JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = $1`,
    [orderId]
  );
  for (const item of existingItems.rows) {
    if (item.type !== 'product') continue;
    const currentStock = Number(item.stock_quantity || 0);
    if (currentStock < Number(item.quantity)) {
      throw { status: 400, message: `Недостаточно на складе: ${item.name || item.product_id}` };
    }
    const nextStock = currentStock - Number(item.quantity);
    await db.query('UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2',
      [item.quantity, item.product_id]);
    await logStockHistory(db, {
      productId: item.product_id, actionType: 'order_sale',
      quantity: Number(item.quantity), balanceAfter: nextStock,
      actorUserId, payload: { orderId },
    });
  }
}

async function applyStockForStatusTransition(db, orderId, prevStatus, nextStatus, actorUserId = null) {
  if (prevStatus !== 'ready' && nextStatus === 'ready') {
    await deductOrderStock(db, orderId, actorUserId);
  } else if (prevStatus === 'ready' && nextStatus !== 'ready') {
    await restoreOrderStock(db, orderId, actorUserId);
  }
}

async function upsertOrderItems(db, orderId, items, actorUserId = null) {
  let total = 0;
  for (const item of items) {
    const { product_id, quantity } = item;
    if (!product_id || !quantity || quantity <= 0) throw { status: 400, message: 'Invalid item data' };
    const prod = await db.query(
      'SELECT id, name, type, price, stock_quantity FROM products WHERE id = $1', [product_id]
    );
    const product = prod.rows[0];
    if (!product) throw { status: 404, message: `Product ${product_id} not found` };
    total += parseFloat(product.price) * quantity;
    await db.query(
      'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ($1, $2, $3, $4)',
      [orderId, product_id, quantity, product.price]
    );
  }
  return total;
}

router.get('/statuses', (req, res) => res.json(ORDER_STATUSES));

router.get('/', async (req, res) => {
  try {
    const { client_id, status, search } = req.query;
    const { page, limit, offset } = paginate(req); // BUG-009
    const params = [];
    const conditions = [];

    if (client_id) { params.push(client_id); conditions.push(`o.client_id = $${params.length}`); }
    if (status)    { params.push(status);    conditions.push(`o.status = $${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(c.name LIKE $${params.length} OR c.phone LIKE $${params.length})`);
    }
    const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';

    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM orders o LEFT JOIN clients c ON o.client_id = c.id${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].count) || 0;

    params.push(limit, offset);
    const orderRows = await pool.query(
      `SELECT o.*,
         c.name as client_name, c.phone as client_phone,
         u.name as created_by_name, u.username as created_by_username
       FROM orders o
       LEFT JOIN clients c ON o.client_id = c.id
       LEFT JOIN users u ON o.created_by = u.id
       ${where}
       ORDER BY o.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const orders = await buildFullOrders(orderRows.rows); // BUG-010
    res.json({ data: orders, total, page, limit });
  } catch (err) {
    logger.error('Orders GET error', { err });
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const order = await getFullOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    logger.error('Orders GET/:id error', { err });
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', async (req, res) => {
  const db = await pool.connect();
  try {
    const { client_id, items, status, comment } = req.body;
    if (!client_id || !Array.isArray(items) || items.length === 0)
      return res.status(400).json({ error: 'client_id and items required' });

    await db.query('BEGIN');

    const clientCheck = await db.query('SELECT id FROM clients WHERE id = $1', [client_id]);
    if (!clientCheck.rows[0]) {
      await db.query('ROLLBACK');
      return res.status(404).json({ error: 'Client not found' });
    }

    const orderStatus = VALID_STATUSES.includes(status) ? status : 'new';

    // BUG-002: Use RETURNING id to avoid race condition
    const insertResult = await db.query(
      'INSERT INTO orders (client_id, status, created_by, comment) VALUES ($1, $2, $3, $4) RETURNING id',
      [client_id, orderStatus, req.user?.id || null, comment || null]
    );
    const orderId = insertResult.rows[0]?.id;
    if (!orderId) { await db.query('ROLLBACK'); return res.status(500).json({ error: 'Could not get order id' }); }

    const total = await upsertOrderItems(db, orderId, items, req.user?.id || null);
    await applyStockForStatusTransition(db, orderId, 'new', orderStatus, req.user?.id || null);
    await db.query('UPDATE orders SET total_amount = $1 WHERE id = $2', [total, orderId]);
    await db.query('COMMIT');

    logger.info('Order created', { actorId: req.user?.id, orderId, clientId: client_id });
    const full = await getFullOrder(orderId);
    await notifyOrderCreated({
      order: full,
      actorName: req.user?.name || req.user?.username || null,
    });
    res.status(201).json(full);
  } catch (err) {
    try { await db.query('ROLLBACK'); } catch {}
    if (err.status) return res.status(err.status).json({ error: err.message });
    logger.error('Orders POST error', { err });
    res.status(500).json({ error: 'Server error' });
  } finally { db.release(); }
});

router.put('/:id', async (req, res) => {
  const db = await pool.connect();
  try {
    const { client_id, items, status, comment } = req.body;
    if (!client_id || !Array.isArray(items) || items.length === 0)
      return res.status(400).json({ error: 'client_id and items required' });
    if (status && !VALID_STATUSES.includes(status))
      return res.status(400).json({ error: 'Invalid status' });

    await db.query('BEGIN');

    const exists = await db.query('SELECT id, status FROM orders WHERE id = $1', [req.params.id]);
    const existingOrder = exists.rows[0];
    if (!existingOrder) { await db.query('ROLLBACK'); return res.status(404).json({ error: 'Order not found' }); }

    await applyStockForStatusTransition(db, req.params.id, existingOrder.status, 'new', req.user?.id || null);
    await db.query(
      'UPDATE orders SET client_id=$1, status=$2, comment=$3, updated_at=NOW() WHERE id=$4',
      [client_id, status || 'new', comment || null, req.params.id]
    );
    await db.query('DELETE FROM order_items WHERE order_id = $1', [req.params.id]);
    const total = await upsertOrderItems(db, req.params.id, items, req.user?.id || null);
    await applyStockForStatusTransition(db, req.params.id, 'new', status || 'new', req.user?.id || null);
    await db.query('UPDATE orders SET total_amount = $1 WHERE id = $2', [total, req.params.id]);
    await db.query('COMMIT');

    logger.info('Order updated', { actorId: req.user?.id, orderId: req.params.id });
    const full = await getFullOrder(req.params.id);
    await notifyOrderStatusChanged({
      order: full,
      actorName: req.user?.name || req.user?.username || null,
      previousStatus: existingOrder.status,
    });
    res.json(full);
  } catch (err) {
    try { await db.query('ROLLBACK'); } catch {}
    if (err.status) return res.status(err.status).json({ error: err.message });
    logger.error('Orders PUT error', { err });
    res.status(500).json({ error: 'Server error' });
  } finally { db.release(); }
});

router.patch('/:id/status', async (req, res) => {
  const db = await pool.connect();
  try {
    const { status } = req.body;
    if (!status || !VALID_STATUSES.includes(status))
      return res.status(400).json({ error: `Invalid status. Valid: ${VALID_STATUSES.join(', ')}` });

    await db.query('BEGIN');
    const check = await db.query('SELECT id, status FROM orders WHERE id = $1', [req.params.id]);
    const existingOrder = check.rows[0];
    if (!existingOrder) { await db.query('ROLLBACK'); return res.status(404).json({ error: 'Order not found' }); }

    await applyStockForStatusTransition(db, req.params.id, existingOrder.status, status, req.user?.id || null);
    await db.query('UPDATE orders SET status = $1, updated_at=NOW() WHERE id = $2', [status, req.params.id]);
    await db.query('COMMIT');

    logger.info('Order status changed', { actorId: req.user?.id, orderId: req.params.id, from: existingOrder.status, to: status });
    const full = await getFullOrder(req.params.id);
    await notifyOrderStatusChanged({
      order: full,
      actorName: req.user?.name || req.user?.username || null,
      previousStatus: existingOrder.status,
    });
    res.json(full);
  } catch (err) {
    try { await db.query('ROLLBACK'); } catch {}
    if (err.status) return res.status(err.status).json({ error: err.message });
    logger.error('Orders PATCH status error', { err });
    res.status(500).json({ error: 'Server error' });
  } finally { db.release(); }
});

router.delete('/:id', async (req, res) => {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const check = await db.query('SELECT id, status FROM orders WHERE id = $1', [req.params.id]);
    if (!check.rows[0]) { await db.query('ROLLBACK'); return res.status(404).json({ error: 'Order not found' }); }

    if (check.rows[0].status === 'ready') {
      await restoreOrderStock(db, req.params.id, req.user?.id || null);
    }
    await db.query('DELETE FROM orders WHERE id = $1', [req.params.id]);
    await db.query('COMMIT');

    logger.info('Order deleted', { actorId: req.user?.id, orderId: req.params.id });
    res.json({ message: 'Order deleted' });
  } catch (err) {
    try { await db.query('ROLLBACK'); } catch {}
    logger.error('Orders DELETE error', { err });
    res.status(500).json({ error: 'Server error' });
  } finally { db.release(); }
});

module.exports = router;
