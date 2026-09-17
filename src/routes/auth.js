const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { pool } = require('../db/pool');
const { authenticateJWT } = require('../middleware/auth');
const { loginSchema, validate } = require('../middleware/validators');

const router = express.Router();

router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password, role } = req.validated;
    const [rows] = await pool.query(
      `SELECT u.id, u.email, u.password_hash, u.full_name, u.role, u.branch,
              u.hub_id, h.name AS hub_name, h.region AS hub_region
       FROM users u
       LEFT JOIN hubs h ON u.hub_id = h.id
       WHERE u.email = ? AND u.role = ? LIMIT 1`,
      [email, role]
    );
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign(
      { id: user.id, role: user.role, name: user.full_name, hubId: user.hub_id || null },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );
    await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);
    return res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.full_name,
          role: user.role,
          branch: user.branch || null,
          hubId: user.hub_id || null,
          hubName: user.hub_name || null,
          hubRegion: user.hub_region || null,
        },
        expiresIn: env.JWT_EXPIRES_IN,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authenticateJWT, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.email, u.full_name AS name, u.role, u.branch,
              u.hub_id AS hubId, h.name AS hubName, h.region AS hubRegion,
              u.created_at AS createdAt, u.last_login_at AS lastLoginAt
       FROM users u
       LEFT JOIN hubs h ON u.hub_id = h.id
       WHERE u.id = ? LIMIT 1`,
      [req.user.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', authenticateJWT, (_req, res) => {
  return res.json({ success: true, data: { message: 'Logged out' } });
});

module.exports = router;
