const router = require('express').Router();
const pool = require('../config/database');
const logger = require('../utils/logger');

const DB_TYPE = (process.env.DB_TYPE || 'postgres').toLowerCase();

function monthTrunc() {
  return DB_TYPE === 'sqlite'
    ? "strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')"
    : "DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())";
}

function last30days() {
  return DB_TYPE === 'sqlite'
    ? "created_at >= datetime('now', '-30 days')"
    : "created_at >= NOW() - INTERVAL '30 days'";
}

function dateOf(col) {
  return DB_TYPE === 'sqlite' ? `date(${col})` : `DATE(${col})`;
}

router.get('/', async (req, res) => {
  try {
    const [
      totalClients,
      totalProducts,
      totalOrders,
      totalRevenue,
      ordersThisMonth,
      revenueThisMonth,
      statusStats,
      salesByDay,
      topClients,
      topProducts,
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM clients'),
      pool.query('SELECT COUNT(*) as count FROM products WHERE active = $1', [DB_TYPE === 'sqlite' ? 1 : true]),
      pool.query('SELECT COUNT(*) as count FROM orders'),
      pool.query("SELECT COALESCE(SUM(total_amount), 0) as total FROM orders WHERE status = $1", ['ready']),
      pool.query(`SELECT COUNT(*) as count FROM orders WHERE ${monthTrunc()}`),
      pool.query(`SELECT COALESCE(SUM(total_amount), 0) as total FROM orders WHERE ${monthTrunc()} AND status = $1`, ['ready']),
      pool.query('SELECT status, COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total FROM orders GROUP BY status ORDER BY count DESC'),
      pool.query(`
        SELECT ${dateOf('created_at')} as date,
          COALESCE(SUM(total_amount), 0) as revenue
        FROM orders
        WHERE ${last30days()} AND status = $1
        GROUP BY ${dateOf('created_at')}
        ORDER BY ${dateOf('created_at')} ASC
      `, ['ready']),
      pool.query(`
        SELECT c.id, c.name, c.phone,
          COUNT(o.id) as orders_count,
          COALESCE(SUM(o.total_amount), 0) as total_spent
        FROM clients c
        LEFT JOIN orders o ON c.id = o.client_id
        GROUP BY c.id, c.name, c.phone
        ORDER BY orders_count DESC
        LIMIT 5
      `),
      pool.query(`
        SELECT p.id, p.name, p.price,
          COALESCE(SUM(oi.quantity), 0) as total_sold,
          COALESCE(SUM(oi.quantity * oi.price), 0) as total_revenue
        FROM products p
        LEFT JOIN order_items oi ON p.id = oi.product_id
        GROUP BY p.id, p.name, p.price
        ORDER BY total_sold DESC
        LIMIT 5
      `),
    ]);

    res.json({
      overview: {
        total_clients:     parseInt(totalClients.rows[0].count) || 0,
        total_products:    parseInt(totalProducts.rows[0].count) || 0,
        total_orders:      parseInt(totalOrders.rows[0].count) || 0,
        total_revenue:     parseFloat(totalRevenue.rows[0].total) || 0,
        orders_this_month: parseInt(ordersThisMonth.rows[0].count) || 0,
        revenue_this_month: parseFloat(revenueThisMonth.rows[0].total) || 0,
      },
      status_stats: statusStats.rows.map(r => ({
        status: r.status,
        count: parseInt(r.count) || 0,
        total: parseFloat(r.total) || 0,
      })),
      sales_by_day: salesByDay.rows.map(r => ({
        date: r.date,
        revenue: parseFloat(r.revenue) || 0,
      })),
      top_clients: topClients.rows.map(r => ({
        id: r.id, name: r.name, phone: r.phone,
        orders_count: parseInt(r.orders_count) || 0,
        total_spent: parseFloat(r.total_spent) || 0,
      })),
      top_products: topProducts.rows.map(r => ({
        id: r.id, name: r.name, price: parseFloat(r.price) || 0,
        total_sold: parseInt(r.total_sold) || 0,
        total_revenue: parseFloat(r.total_revenue) || 0,
      })),
    });
  } catch (err) {
    logger.error('Stats GET error', { err });
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
