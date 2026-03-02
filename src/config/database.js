/**
 * Universal database adapter.
 * pg-compatible interface: pool.query(sql, params) → { rows }
 * Supports PostgreSQL and SQLite (better-sqlite3).
 * Set DB_TYPE=sqlite or DB_TYPE=postgres in .env
 */

const DB_TYPE = (process.env.DB_TYPE || 'postgres').toLowerCase();
const logger = require('../utils/logger');

let adapter;

if (DB_TYPE === 'sqlite') {
  const Database = require('better-sqlite3');
  const path = require('path');
  const fs = require('fs');

  const dbPath = process.env.SQLITE_PATH || path.join(__dirname, '../../data/fastcrm.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  function convertSQL(sql, params) {
    let converted = sql
      // Placeholders: $1 $2 → ?
      .replace(/\$\d+/g, '?')
      // Types
      .replace(/TIMESTAMPTZ/gi, 'TEXT')
      .replace(/TIMESTAMP(?!Z)/gi, 'TEXT')
      .replace(/NUMERIC\(\d+,\s*\d+\)/gi, 'REAL')
      .replace(/SERIAL\s+PRIMARY\s+KEY/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT')
      .replace(/VARCHAR\(\d+\)/gi, 'TEXT')
      .replace(/BOOLEAN/gi, 'INTEGER')
      // Dates
      .replace(/DEFAULT\s+NOW\(\)/gi, "DEFAULT (datetime('now'))")
      .replace(/\bCURRENT_TIMESTAMP\b/gi, "datetime('now')")
      .replace(/\bCURRENT_DATE\b/gi, "date('now')")
      .replace(/\bNOW\(\)/gi, "datetime('now')")
      // ILIKE → LIKE
      .replace(/\bILIKE\b/gi, 'LIKE')
      // json_agg
      .replace(
        /COALESCE\(json_agg\((.+?)\)\s*FILTER\s*\(WHERE\s+(\w+(?:\.\w+)?)\s+IS\s+NOT\s+NULL\),\s*'(\[\])'\)/gis,
        "json_group_array(CASE WHEN $2 IS NOT NULL THEN $1 ELSE NULL END)"
      )
      .replace(/json_agg\(/gi, 'json_group_array(')
      .replace(/json_build_object\(/gi, 'json_object(')
      // Date truncation
      .replace(/DATE_TRUNC\('month',\s*([^)]+)\)/gi, "strftime('%Y-%m', $1)")
      .replace(/DATE_TRUNC\('day',\s*([^)]+)\)/gi, "date($1)")
      // Intervals
      .replace(/NOW\(\)\s*-\s*INTERVAL\s*'(\d+)\s*days?'/gi, "datetime('now', '-$1 days')")
      .replace(/CURRENT_DATE\s*-\s*INTERVAL\s*'(\d+)\s*days?'/gi, "date('now', '-$1 days')")
      // RETURNING — SQLite doesn't support it, strip it
      .replace(/\bRETURNING\b[^\n;]*/gi, '')
      // COUNT(*) alias
      .replace(/COUNT\(\*\)\s+as\s+c\b/gi, 'COUNT(*) as c');

    return converted;
  }

  /**
   * SQLite doesn't support ANY($1::int[]).
   * Detect this pattern and expand it into IN (?, ?, ...) with unpacked params.
   * Returns { sql, params } with the transformation applied.
   */
  function expandAny(sql, params) {
    // Match: col = ANY($N::int[])  or  col = ANY($N)
    const anyRegex = /(\w+(?:\.\w+)?)\s*=\s*ANY\s*\(\s*\?(?:::[^\)]+)?\s*\)/gi;
    let paramIndex = 0;
    let newParams = [];
    let paramPositions = []; // track which ? maps to which param

    // First, count all ?'s to know their positions
    // After convertSQL, all $N become ? in order
    // We need to find which ? corresponds to the ANY array param

    // Simpler approach: find ANY(?) patterns and replace them
    let matchIndex = 0;
    const flatParams = [...params];

    // Count ?'s before each ANY(?) to know the index
    const newSql = sql.replace(anyRegex, (match, col) => {
      // Count how many ? appear before this match in the already-processed string
      const before = sql.substring(0, sql.indexOf(match, matchIndex));
      const qCount = (before.match(/\?/g) || []).length;
      matchIndex = sql.indexOf(match, matchIndex) + match.length;

      const arr = flatParams[qCount];
      if (!Array.isArray(arr)) return match; // can't expand, leave as is

      // Remove the array from params and expand into individual ?
      flatParams.splice(qCount, 1, ...arr);
      const placeholders = arr.map(() => '?').join(', ');
      return `${col} IN (${placeholders})`;
    });

    return { sql: newSql, params: flatParams };
  }

  adapter = {
    async query(sql, params = []) {
      const keyword = sql.trim().split(/\s/)[0].toUpperCase();
      if (keyword === 'BEGIN')    { try { db.prepare('BEGIN').run(); } catch {} return { rows: [] }; }
      if (keyword === 'COMMIT')   { try { db.prepare('COMMIT').run(); } catch {} return { rows: [] }; }
      if (keyword === 'ROLLBACK') { try { db.prepare('ROLLBACK').run(); } catch {} return { rows: [] }; }

      let converted = convertSQL(sql, params);
      let finalParams = [...params];

      // Expand ANY(array) → IN (?, ?, ...) for SQLite
      if (/ANY\s*\(/i.test(converted)) {
        const expanded = expandAny(converted, finalParams);
        converted = expanded.sql;
        finalParams = expanded.params;
      }

      const isRead = /^\s*(SELECT|WITH|PRAGMA)/i.test(converted);

      try {
        const stmt = db.prepare(converted);
        if (isRead) {
          const rows = stmt.all(...finalParams);
          return { rows: rows.map(normalizeSQLiteRow) };
        } else {
          const info = stmt.run(...finalParams);
          // For INSERT: return new row via lastInsertRowid
          if (/^\s*INSERT/i.test(sql)) {
            const tableName = sql.match(/INTO\s+(\w+)/i)?.[1];
            if (tableName && info.lastInsertRowid) {
              try {
                const row = db.prepare(`SELECT * FROM ${tableName} WHERE rowid = ?`).get(info.lastInsertRowid);
                return { rows: row ? [normalizeSQLiteRow(row)] : [] };
              } catch {}
            }
          }
          return { rows: [] };
        }
      } catch (err) {
        const ignorable = /duplicate column name|already exists|no such table/i.test(err.message || '');
        if (!ignorable) {
          logger.error('SQLite query error', { error: err.message, sql: converted.substring(0, 300) });
        }
        throw err;
      }
    },

    async connect() {
      return {
        query: async (sql, params) => adapter.query(sql, params),
        release: () => {},
      };
    },

    on() {},
  };

} else {
  // PostgreSQL
  const { Pool } = require('pg');
  adapter = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'fastcrm',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
  adapter.on('error', err => logger.error('DB pool error', { err }));
}

function normalizeSQLiteRow(row) {
  if (!row) return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === 'string' && (v.startsWith('[') || v.startsWith('{'))) {
      try {
        const parsed = JSON.parse(v);
        out[k] = Array.isArray(parsed) ? parsed.filter(x => x !== null) : parsed;
        continue;
      } catch {}
    }
    if ((k === 'notified' || k === 'active') && (v === 0 || v === 1)) {
      out[k] = v === 1;
      continue;
    }
    out[k] = v;
  }
  return out;
}

module.exports = adapter;
