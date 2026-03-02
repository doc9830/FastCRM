const router = require('express').Router();
const pool = require('../config/database');
const logger = require('../utils/logger');
const { validateProduct } = require('../middleware/validate');
const { logStockHistory, getProductStockHistory } = require('../models/stockHistory');

function paginate(req) {
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
  return { page, limit, offset: (page - 1) * limit };
}

router.get('/', async (req, res) => {
  try {
    const { search, active } = req.query;
    const { page, limit, offset } = paginate(req); // BUG-009
    const params = [];
    let extraWhere = '';

    if (active !== undefined) {
      params.push(active === 'true' ? 1 : 0);
      extraWhere += ` AND p.active = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      extraWhere += ` AND (p.name ILIKE $${params.length} OR p.description ILIKE $${params.length})`;
    }

    const baseQuery = `
      FROM products p
      LEFT JOIN (
        SELECT oi.product_id, SUM(oi.quantity) AS reserved_quantity
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.status = 'in_progress'
        GROUP BY oi.product_id
      ) r ON r.product_id = p.id
      WHERE 1=1${extraWhere}`;

    const countResult = await pool.query(`SELECT COUNT(*) as count ${baseQuery}`, params);
    const total = parseInt(countResult.rows[0].count) || 0;

    params.push(limit, offset);
    const result = await pool.query(
      `SELECT p.*,
              COALESCE(r.reserved_quantity, 0) AS reserved_quantity,
              CASE WHEN p.type = 'product' THEN p.stock_quantity ELSE 0 END AS real_stock_quantity,
              CASE WHEN p.type = 'product' THEN p.stock_quantity - COALESCE(r.reserved_quantity, 0) ELSE 0 END AS available_stock_quantity
       ${baseQuery}
       ORDER BY p.name ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ data: result.rows, total, page, limit });
  } catch (err) {
    logger.error('Products GET error', { err });
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id/reservations', async (req, res) => {
  try {
    const check = await pool.query('SELECT id FROM products WHERE id = $1', [req.params.id]);
    if (!check.rows[0]) return res.status(404).json({ error: 'Product not found' });
    const reservations = await pool.query(
      `SELECT o.id AS order_id, o.created_at, o.status, c.name AS client_name, SUM(oi.quantity) AS quantity
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       LEFT JOIN clients c ON c.id = o.client_id
       WHERE oi.product_id = $1 AND o.status = 'in_progress'
       GROUP BY o.id, o.created_at, o.status, c.name
       ORDER BY o.created_at DESC, o.id DESC`,
      [req.params.id]
    );
    res.json(reservations.rows);
  } catch (err) {
    logger.error('Products GET reservations error', { err });
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id/history', async (req, res) => {
  try {
    const check = await pool.query('SELECT id FROM products WHERE id = $1', [req.params.id]);
    if (!check.rows[0]) return res.status(404).json({ error: 'Product not found' });
    const history = await getProductStockHistory(req.params.id, req.query.limit);
    res.json(history);
  } catch (err) {
    logger.error('Products GET history error', { err });
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Product not found' });
    res.json(result.rows[0]);
  } catch (err) {
    logger.error('Products GET/:id error', { err });
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', validateProduct, async (req, res) => {
  try {
    const { name, description, price, type, stock_quantity } = req.body;
    const productType = type === 'product' ? 'product' : 'service';
    const stockQty = productType === 'product' ? Number(stock_quantity || 0) : 0;
    if (!Number.isInteger(stockQty) || stockQty < 0)
      return res.status(400).json({ error: 'Stock quantity must be integer >= 0' });

    const result = await pool.query(
      'INSERT INTO products (name, description, price, type, stock_quantity) VALUES ($1, $2, $3, $4, $5)',
      [name.trim(), description || null, price, productType, stockQty]
    );
    logger.info('Product created', { actorId: req.user?.id, name });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    logger.error('Products POST error', { err });
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', validateProduct, async (req, res) => {
  try {
    const { name, description, price, active, type, stock_quantity } = req.body;
    const productType = type === 'product' ? 'product' : 'service';
    const stockQty = productType === 'product' ? Number(stock_quantity || 0) : 0;
    if (!Number.isInteger(stockQty) || stockQty < 0)
      return res.status(400).json({ error: 'Stock quantity must be integer >= 0' });

    const check = await pool.query('SELECT id FROM products WHERE id = $1', [req.params.id]);
    if (!check.rows[0]) return res.status(404).json({ error: 'Product not found' });

    // BUG-017: explicit updated_at for SQLite compatibility
    await pool.query(
      'UPDATE products SET name=$1, description=$2, price=$3, active=COALESCE($4, active), type=$5, stock_quantity=$6, updated_at=NOW() WHERE id=$7',
      [name.trim(), description || null, price, active !== undefined ? (active ? 1 : 0) : null, productType, stockQty, req.params.id]
    );
    const updated = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    logger.info('Product updated', { actorId: req.user?.id, productId: req.params.id });
    res.json(updated.rows[0]);
  } catch (err) {
    logger.error('Products PUT error', { err });
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/stock-adjust', async (req, res) => {
  const db = await pool.connect();
  try {
    const { delta } = req.body;
    const stockDelta = Number(delta);
    if (!Number.isInteger(stockDelta) || stockDelta === 0)
      return res.status(400).json({ error: 'delta must be non-zero integer' });

    await db.query('BEGIN');
    const check = await db.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    const product = check.rows[0];
    if (!product) { await db.query('ROLLBACK'); return res.status(404).json({ error: 'Product not found' }); }
    if (product.type !== 'product') { await db.query('ROLLBACK'); return res.status(400).json({ error: 'Stock management available only for products' }); }

    const nextStock = Number(product.stock_quantity || 0) + stockDelta;
    if (nextStock < 0) { await db.query('ROLLBACK'); return res.status(400).json({ error: 'Not enough stock' }); }

    await db.query('UPDATE products SET stock_quantity = $1, updated_at=NOW() WHERE id = $2', [nextStock, req.params.id]);
    await logStockHistory(db, {
      productId: req.params.id,
      actionType: stockDelta > 0 ? 'manual_in' : 'manual_out',
      quantity: Math.abs(stockDelta),
      balanceAfter: nextStock,
      actorUserId: req.user?.id || null,
    });
    await db.query('COMMIT');

    logger.info('Stock adjusted', { actorId: req.user?.id, productId: req.params.id, delta: stockDelta, newStock: nextStock });
    const updated = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    res.json(updated.rows[0]);
  } catch (err) {
    try { await db.query('ROLLBACK'); } catch {}
    logger.error('Products stock-adjust error', { err });
    res.status(500).json({ error: 'Server error' });
  } finally { db.release(); }
});

router.delete('/:id', async (req, res) => {
  try {
    const check = await pool.query('SELECT id FROM products WHERE id = $1', [req.params.id]);
    if (!check.rows[0]) return res.status(404).json({ error: 'Product not found' });
    await pool.query('DELETE FROM products WHERE id = $1', [req.params.id]);
    logger.info('Product deleted', { actorId: req.user?.id, productId: req.params.id });
    res.json({ message: 'Product deleted' });
  } catch (err) {
    logger.error('Products DELETE error', { err });
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
