const mysql = require('mysql2/promise');
const env = require('../config/env');

const pool = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  multipleStatements: true,
  ssl: {
    rejectUnauthorized: false, // Aiven uses self-signed certs; set to true + provide CA cert for production
  },
});

async function testConnection() {
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.query('SELECT 1 + 1 AS solution');
    console.log('[DB] Connection pool established successfully.');
    return true;
  } catch (err) {
    console.error('[DB] Connection failed:', err.message);
    return false;
  } finally {
    if (conn) conn.release();
  }
}

module.exports = { pool, testConnection };
