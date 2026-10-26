const mysql = require('mysql2/promise');
const env = require('./env');

// A pool re-uses a few open connections instead of opening a new one per request.
const pool = mysql.createPool({
  ...env.db,
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: false, // keep DECIMAL values as exact strings, never floating point
  dateStrings: true, // return DATE/DATETIME as plain strings
  timezone: 'Z',
  charset: 'utf8mb4',
});

/** Run one parameterised query. Values are NEVER concatenated into SQL (stops SQL injection). */
async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function one(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

/** Run several statements as one all-or-nothing unit. */
async function transaction(work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const tx = {
      query: async (sql, params = []) => (await conn.query(sql, params))[0],
      one: async (sql, params = []) => (await conn.query(sql, params))[0][0] || null,
    };
    const result = await work(tx);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, query, one, transaction };
