const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { pool } = require('../db/pool');

async function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || typeof authHeader !== 'string') {
    return res.status(401).json({ error: 'Missing authorization token' });
  }
  const parts = authHeader.split(' ');
  const token = parts.length === 2 && parts[0] === 'Bearer' ? parts[1] : authHeader;
  if (!token) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);

    const [rows] = await pool.query('SELECT id, role, full_name, hub_id FROM users WHERE id = ? LIMIT 1', [decoded.id]);
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid user session. Please log in again.' });
    }

    req.user = {
      id: rows[0].id,
      role: rows[0].role || decoded.role,
      name: rows[0].full_name || decoded.name,
      hubId: rows[0].hub_id || decoded.hubId || null,
    };
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireRoles(...roles) {
  return function (req, res, next) {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: insufficient role permissions' });
    }
    next();
  };
}

module.exports = { authenticateJWT, requireRoles };
