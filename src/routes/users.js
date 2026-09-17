const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const env = require('../config/env');
const { pool } = require('../db/pool');
const { authenticateJWT, requireRoles } = require('../middleware/auth');
const {
  userCreateSchema,
  userUpdateSchema,
  resetPasswordSchema,
  validate,
} = require('../middleware/validators');

const router = express.Router();

function serializeUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.full_name,
    role: row.role,
    branch: row.branch || undefined,
    hubId: row.hub_id || undefined,
    hubName: row.hub_name || undefined,
    hubRegion: row.hub_region || undefined,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at || undefined,
  };
}

const USER_SELECT = `
  u.id, u.email, u.full_name, u.role, u.branch, u.hub_id,
  h.name AS hub_name, h.region AS hub_region,
  u.created_at, u.last_login_at
`;

const USER_JOINS = `FROM users u LEFT JOIN hubs h ON u.hub_id = h.id`;

router.get('/', authenticateJWT, async (req, res, next) => {
  try {
    const { role, hubId } = req.query;
    let sql = `SELECT ${USER_SELECT} ${USER_JOINS}`;
    const conditions = [];
    const params = [];
    if (role) {
      conditions.push('u.role = ?');
      params.push(role);
    }
    if (hubId) {
      conditions.push('u.hub_id = ?');
      params.push(hubId);
    }
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY u.created_at DESC';
    const [rows] = await pool.query(sql, params);
    return res.json({ success: true, data: rows.map(serializeUser) });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', authenticateJWT, async (req, res, next) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT ${USER_SELECT} ${USER_JOINS} WHERE u.id = ? LIMIT 1`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.json({ success: true, data: serializeUser(rows[0]) });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  authenticateJWT,
  requireRoles('admin'),
  validate(userCreateSchema),
  async (req, res, next) => {
    try {
      const { name, email, role, password, branch, hubId } = req.validated;
      const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
      if (existing.length > 0) {
        return res.status(409).json({ error: 'Email already in use' });
      }
      const id = uuidv4();
      const hash = await bcrypt.hash(password, env.BCRYPT_SALT_ROUNDS);
      await pool.query(
        'INSERT INTO users (id, email, password_hash, full_name, role, branch, hub_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, email, hash, name, role, branch || null, hubId || null]
      );
      const [rows] = await pool.query(
        `SELECT ${USER_SELECT} ${USER_JOINS} WHERE u.id = ? LIMIT 1`,
        [id]
      );
      return res.status(201).json({ success: true, data: serializeUser(rows[0]) });
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/:id',
  authenticateJWT,
  requireRoles('admin'),
  validate(userUpdateSchema),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { name, email, role, branch, hubId, password } = req.validated;

      const [existing] = await pool.query(
        'SELECT id, email FROM users WHERE id = ? LIMIT 1',
        [id]
      );
      if (existing.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (email && email !== existing[0].email) {
        const [emailCheck] = await pool.query(
          'SELECT id FROM users WHERE email = ? AND id <> ?',
          [email, id]
        );
        if (emailCheck.length > 0) {
          return res.status(409).json({ error: 'Email already in use' });
        }
      }

      const fields = [];
      const params = [];
      if (name !== undefined) { fields.push('full_name = ?'); params.push(name); }
      if (email !== undefined) { fields.push('email = ?'); params.push(email); }
      if (role !== undefined) { fields.push('role = ?'); params.push(role); }
      if (branch !== undefined) { fields.push('branch = ?'); params.push(branch || null); }
      if (hubId !== undefined) { fields.push('hub_id = ?'); params.push(hubId || null); }
      if (password) {
        const hash = await bcrypt.hash(password, env.BCRYPT_SALT_ROUNDS);
        fields.push('password_hash = ?');
        params.push(hash);
      }

      if (fields.length > 0) {
        params.push(id);
        await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, params);
      }

      const [rows] = await pool.query(
        `SELECT ${USER_SELECT} ${USER_JOINS} WHERE u.id = ? LIMIT 1`,
        [id]
      );
      return res.json({ success: true, data: serializeUser(rows[0]) });
    } catch (err) {
      next(err);
    }
  }
);

router.delete('/:id', authenticateJWT, requireRoles('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    if (req.user.id === id) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }
    const [existing] = await pool.query('SELECT id FROM users WHERE id = ? LIMIT 1', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    await pool.query('DELETE FROM users WHERE id = ?', [id]);
    return res.json({ success: true, data: { deleted: true, id } });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/:id/reset-password',
  authenticateJWT,
  requireRoles('admin'),
  validate(resetPasswordSchema),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { newPassword } = req.validated;
      const [existing] = await pool.query('SELECT id FROM users WHERE id = ? LIMIT 1', [id]);
      if (existing.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      const hash = await bcrypt.hash(newPassword, env.BCRYPT_SALT_ROUNDS);
      await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, id]);
      return res.json({ success: true, data: { reset: true, id } });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
