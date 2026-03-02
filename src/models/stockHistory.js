const pool = require('../config/database');

function getOrderIdFromPayload(payload) {
  const rawValue = payload?.oid ?? payload?.orderId ?? payload?.order_id;
  const orderId = Number(rawValue);
  return Number.isInteger(orderId) && orderId > 0 ? orderId : null;
}


function compactPayload(data = {}) {
  if (!data || typeof data !== 'object') return null;
  const compact = {};
  if (data.orderId) compact.oid = Number(data.orderId);
  if (data.orderNumber) compact.on = data.orderNumber;
  if (data.note) compact.n = data.note;
  return Object.keys(compact).length ? JSON.stringify(compact) : null;
}

async function logStockHistory(db, { productId, actionType, quantity, balanceAfter, actorUserId = null, payload = null }) {
  await db.query(
    `INSERT INTO product_stock_history (product_id, action_type, quantity, balance_after, payload, actor_user_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [productId, actionType, quantity, balanceAfter, compactPayload(payload), actorUserId]
  );
}

async function getProductStockHistory(productId, limit = 100) {
  const lim = Math.max(1, Math.min(Number(limit) || 100, 500));
  const result = await pool.query(
    `SELECT h.id, h.product_id, h.action_type, h.quantity, h.balance_after, h.payload, h.created_at,
            u.name AS actor_name, u.username AS actor_username
     FROM product_stock_history h
     LEFT JOIN users u ON u.id = h.actor_user_id
     WHERE h.product_id = $1
     ORDER BY h.created_at DESC, h.id DESC
     LIMIT $2`,
    [productId, lim]
  );

  const parsedRows = result.rows.map((row) => {
    let payload = null;
    if (row.payload) {
      try { payload = JSON.parse(row.payload); } catch { payload = null; }
    }
    return { ...row, payload, payload_raw: row.payload };
  });

  return parsedRows.map((row) => {
    const hasOrderAction = row.action_type === 'order_sale' || row.action_type === 'order_restore' || row.action_type === 'order_writeoff';
    const { payload_raw, ...safeRow } = row;
    return {
      ...safeRow,
      order_id: hasOrderAction ? getOrderIdFromPayload(row.payload) : null,
    };
  });
}

module.exports = { logStockHistory, getProductStockHistory };
