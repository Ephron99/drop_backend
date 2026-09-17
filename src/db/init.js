const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const env = require('../config/env');

async function initDatabase() {
  let conn;
  try {
    conn = await mysql.createConnection({
      host: env.DB_HOST,
      port: env.DB_PORT,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      multipleStatements: true,
    });

    const schemaPath = path.join(__dirname, 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');
    const statements = sql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const stmt of statements) {
      await conn.query(stmt);
    }

    const [scopeColumns] = await conn.query('SHOW COLUMNS FROM scopes');
    const scopeColumnNames = new Set(scopeColumns.map((column) => column.Field));

    const [progressColumns] = await conn.query('SHOW COLUMNS FROM progress_entries');
    const progressColumnNames = new Set(progressColumns.map((column) => column.Field));
    if (!progressColumnNames.has('scope_id')) {
      await conn.query('ALTER TABLE progress_entries ADD COLUMN scope_id CHAR(36) NULL');
    }
    if (!progressColumnNames.has('completed_km')) {
      await conn.query('ALTER TABLE progress_entries ADD COLUMN completed_km DECIMAL(10,3) DEFAULT 0');
    }
    await conn.query('ALTER TABLE progress_entries MODIFY COLUMN location_id CHAR(36) NULL');

    if (!scopeColumnNames.has('line_id')) {
      await conn.query('ALTER TABLE scopes ADD COLUMN line_id CHAR(36) NULL');
    }

    if (!scopeColumnNames.has('transformer_id')) {
      await conn.query('ALTER TABLE scopes ADD COLUMN transformer_id CHAR(36) NULL');
    }

    if (scopeColumnNames.has('status')) {
      const [statusColumn] = await conn.query('SHOW COLUMNS FROM scopes LIKE ?', ['status']);
      const statusType = statusColumn?.[0]?.Type || '';
      if (!statusType.includes("'approved'")) {
        await conn.query("ALTER TABLE scopes MODIFY COLUMN status ENUM('draft', 'approved') NOT NULL DEFAULT 'draft'");
      }
    }

    console.log('[INIT-DB] Database created and schema applied successfully.');
    return true;
  } catch (err) {
    console.error('[INIT-DB] Failed:', err.message);
    return false;
  } finally {
    if (conn) await conn.end();
  }
}

if (require.main === module) {
  initDatabase().then((ok) => process.exit(ok ? 0 : 1));
}

module.exports = { initDatabase };
