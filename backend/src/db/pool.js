import mysql from 'mysql2/promise';
import { config } from '../config/index.js';

export const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true, // return DATE/DATETIME as plain strings (no timezone surprises)
  decimalNumbers: false, // keep DECIMAL as exact strings (money is never stored in floating point)
  multipleStatements: false,
});

/** Run a parameterised query. Values are escaped by the driver => safe against SQL injection. */
export async function query(sql, params = [], conn = null) {
  const [rows] = await (conn || pool).query(sql, params); // pass `conn` to run inside a transaction
  return rows;
}

/** Run several statements atomically. Rolls back everything if the callback throws. */
export async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
