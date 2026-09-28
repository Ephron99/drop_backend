const env = require('./config/env');
const app = require('./app');
const { testConnection } = require('./db/pool');
const { initDatabase } = require('./db/init');

async function init() {
  console.log('[SERVER] Initializing database...');
  const dbOk = await initDatabase();
  if (!dbOk) {
    console.warn('[SERVER] Database init reported issues, proceeding anyway...');
  }
  try {
    await testConnection();
  } catch (err) {
    console.warn('[SERVER] Database connection failed (expected for local dev without DB):', err.message);
    console.log('[SERVER] Proceeding without database for local development.');
  }
}

async function start() {
  try {
    await init();
    const server = app.listen(env.PORT, () => {
      console.log(`[SERVER] Voltage Drop backend listening on http://localhost:${env.PORT}`);
      console.log(`[SERVER] Health check: http://localhost:${env.PORT}/api/health`);
    });

    function shutdown(signal) {
      console.log(`[SERVER] ${signal} received, shutting down gracefully...`);
      server.close(async () => {
        try {
          const { pool } = require('./db/pool');
          await pool.end();
        } catch (_) {}
        console.log('[SERVER] Shut down complete.');
        process.exit(0);
      });
      setTimeout(() => {
        console.error('[SERVER] Forced exit after timeout.');
        process.exit(1);
      }, 10000);
    }

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (err) {
    console.error('[SERVER] Failed to start:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = { start, init };
