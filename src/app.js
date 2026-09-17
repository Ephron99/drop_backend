const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const env = require('./config/env');

const authRouter = require('./routes/auth');
const usersRouter = require('./routes/users');
const masterRouter = require('./routes/master');
const progressRouter = require('./routes/progress-entries');
const managementRouter = require('./routes/management');
const hubsRouter = require('./routes/hubs');

const app = express();

app.use(morgan('dev'));

app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/master', masterRouter);
app.use('/api/progress', progressRouter);
app.use('/api/management', managementRouter);
app.use('/api/hubs', hubsRouter);

app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', path: req.originalUrl });
});

app.use((err, req, res, _next) => {
  console.error('[ERROR]', err);
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';
  if (res.headersSent) {
    return;
  }
  res.status(status).json({
    error: message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
});

module.exports = app;
