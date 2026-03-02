const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');

const DB_TYPE = (process.env.DB_TYPE || 'postgres').toLowerCase();

// SQLite schema (no triggers, no CREATE INDEX IF NOT EXISTS on expression indexes)
const SQLITE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT,
    role TEXT DEFAULT 'manager',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    note TEXT,
    email TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL CHECK (price >= 0),
    type TEXT NOT NULL DEFAULT 'service' CHECK (type IN ('product', 'service')),
    stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'new',
    total_amount REAL DEFAULT 0,
    comment TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    price REAL NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    reminder_date TEXT,
    notified INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS product_stock_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    payload TEXT,
    actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS organization_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    legal_name TEXT DEFAULT '',
    legal_address TEXT DEFAULT '',
    inn TEXT DEFAULT '',
    telegram_admin_ids TEXT DEFAULT '',
    telegram_bot_token TEXT DEFAULT '',
    ogrn TEXT DEFAULT '',
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
  CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
  CREATE INDEX IF NOT EXISTS idx_orders_client ON orders(client_id);
  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
  CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
  CREATE INDEX IF NOT EXISTS idx_notes_reminder ON notes(reminder_date);
  CREATE INDEX IF NOT EXISTS idx_stock_history_product_created ON product_stock_history(product_id, created_at DESC);
`;

const PG_SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    role VARCHAR(20) DEFAULT 'manager',
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS clients (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    note TEXT,
    email VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
    type VARCHAR(20) NOT NULL DEFAULT 'service' CHECK (type IN ('product', 'service')),
    stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'new',
    total_amount NUMERIC(12,2) DEFAULT 0,
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    price NUMERIC(12,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS notes (
    id SERIAL PRIMARY KEY,
    text TEXT NOT NULL,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    reminder_date TIMESTAMPTZ,
    notified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS product_stock_history (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    action_type VARCHAR(32) NOT NULL,
    quantity INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    payload TEXT,
    actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS organization_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    legal_name TEXT DEFAULT '',
    legal_address TEXT DEFAULT '',
    inn TEXT DEFAULT '',
    telegram_admin_ids TEXT DEFAULT '',
    telegram_bot_token TEXT DEFAULT '',
    ogrn TEXT DEFAULT '',
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
  CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
  CREATE INDEX IF NOT EXISTS idx_orders_client ON orders(client_id);
  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
  CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
  CREATE INDEX IF NOT EXISTS idx_notes_reminder ON notes(reminder_date) WHERE notified = FALSE;
  CREATE INDEX IF NOT EXISTS idx_stock_history_product_created ON product_stock_history(product_id, created_at DESC);
  CREATE OR REPLACE FUNCTION update_updated_at()
  RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
  DROP TRIGGER IF EXISTS trg_clients_upd ON clients;
  CREATE TRIGGER trg_clients_upd BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  DROP TRIGGER IF EXISTS trg_products_upd ON products;
  CREATE TRIGGER trg_products_upd BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  DROP TRIGGER IF EXISTS trg_orders_upd ON orders;
  CREATE TRIGGER trg_orders_upd BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();
`;

async function initDatabase() {
  const client = await pool.connect();
  try {
    if (DB_TYPE === 'sqlite') {
      // SQLite: execute each statement separately
      const stmts = SQLITE_SCHEMA.split(';').map(s => s.trim()).filter(Boolean);
      for (const stmt of stmts) {
        await client.query(stmt);
      }
    } else {
      await client.query('BEGIN');
      await client.query(PG_SCHEMA);
      await client.query('COMMIT');
    }
    logger.info('Database schema ready', { dbType: DB_TYPE.toUpperCase() });

    // Lightweight migrations for existing databases
    if (DB_TYPE === 'sqlite') {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS product_stock_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
          action_type TEXT NOT NULL,
          quantity INTEGER NOT NULL,
          balance_after INTEGER NOT NULL,
          payload TEXT,
          actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `);
      await pool.query("ALTER TABLE products ADD COLUMN type TEXT NOT NULL DEFAULT 'service' CHECK (type IN ('product', 'service'))").catch(() => {});
      await pool.query('ALTER TABLE products ADD COLUMN stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0)').catch(() => {});
      await pool.query('ALTER TABLE product_stock_history ADD COLUMN payload TEXT').catch(() => {});
      await pool.query('ALTER TABLE product_stock_history ADD COLUMN actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL').catch(() => {});
      await pool.query('CREATE INDEX IF NOT EXISTS idx_stock_history_product_created ON product_stock_history(product_id, created_at DESC)').catch(() => {});
      await pool.query("ALTER TABLE organization_settings ADD COLUMN telegram_admin_ids TEXT DEFAULT ''").catch(() => {});
      await pool.query("ALTER TABLE organization_settings ADD COLUMN telegram_bot_token TEXT DEFAULT ''").catch(() => {});
    } else {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS product_stock_history (
          id SERIAL PRIMARY KEY,
          product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
          action_type VARCHAR(32) NOT NULL,
          quantity INTEGER NOT NULL,
          balance_after INTEGER NOT NULL,
          payload TEXT,
          actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await pool.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS type VARCHAR(20) NOT NULL DEFAULT 'service'");
      await pool.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_quantity INTEGER NOT NULL DEFAULT 0");
      await pool.query('ALTER TABLE product_stock_history ADD COLUMN IF NOT EXISTS payload TEXT').catch(() => {});
      await pool.query('ALTER TABLE product_stock_history ADD COLUMN IF NOT EXISTS actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL').catch(() => {});
      await pool.query("UPDATE products SET type = 'service' WHERE type IS NULL");
      await pool.query('CREATE INDEX IF NOT EXISTS idx_stock_history_product_created ON product_stock_history(product_id, created_at DESC)').catch(() => {});
      await pool.query("ALTER TABLE organization_settings ADD COLUMN IF NOT EXISTS telegram_admin_ids TEXT DEFAULT ''").catch(() => {});
      await pool.query("ALTER TABLE organization_settings ADD COLUMN IF NOT EXISTS telegram_bot_token TEXT DEFAULT ''").catch(() => {});
    }

    await pool.query(`
      INSERT INTO organization_settings (id, legal_name, legal_address, inn, telegram_admin_ids, telegram_bot_token, ogrn)
      VALUES (1, '', '', '', '', '', '')
      ON CONFLICT (id) DO NOTHING
    `);

    // Create default admin if missing
    const existing = await pool.query('SELECT id FROM users WHERE username = $1', ['admin']);
    if (existing.rows.length === 0) {
      const adminPass = process.env.ADMIN_PASSWORD;
      if (!adminPass) {
        throw new Error('ADMIN_PASSWORD is required to initialize admin user');
      }
      const hash = await bcrypt.hash(adminPass, 12);
      await pool.query(
        'INSERT INTO users (username, password, name, role) VALUES ($1, $2, $3, $4)',
        ['admin', hash, 'Администратор', 'admin']
      );
      logger.warn('Created admin user from ADMIN_PASSWORD env var', { username: 'admin' });
    }
  } catch (err) {
    if (DB_TYPE !== 'sqlite') {
      try { await client.query('ROLLBACK'); } catch {}
    }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { initDatabase };
