const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db/pool');
const { authenticateJWT, requireRoles } = require('../middleware/auth');

const router = express.Router();

router.use(authenticateJWT);

// GET /hubs - list all hubs
router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT h.id, h.name, h.region,
              COUNT(DISTINCT u_bm.id) AS branch_manager_count,
              COUNT(DISTINCT u_se.id) AS site_engineer_count,
              COUNT(DISTINCT b.id) AS branch_count,
              COUNT(DISTINCT l.id) AS line_count,
              COUNT(DISTINCT t.id) AS transformer_count
       FROM hubs h
       LEFT JOIN users u_bm ON u_bm.hub_id = h.id AND u_bm.role = 'branch_manager'
       LEFT JOIN users u_se ON u_se.hub_id = h.id AND u_se.role = 'site_engineer'
       LEFT JOIN branches b ON b.hub_id = h.id
       LEFT JOIN \`lines\` l ON l.branch_id = b.id
       LEFT JOIN transformers t ON t.line_id = l.id
       GROUP BY h.id, h.name, h.region
       ORDER BY h.name`
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// GET /hubs/:id - single hub with stats
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const [hubRows] = await pool.query(
      'SELECT id, name, region FROM hubs WHERE id = ? LIMIT 1',
      [id]
    );
    if (hubRows.length === 0) {
      return res.status(404).json({ error: 'Hub not found' });
    }
    const hub = hubRows[0];

    // Get branch managers in this hub
    const [managers] = await pool.query(
      `SELECT id, full_name AS name, email, branch FROM users
       WHERE hub_id = ? AND role = 'branch_manager'
       ORDER BY full_name`,
      [id]
    );

    // Get site engineers in this hub
    const [engineers] = await pool.query(
      `SELECT id, full_name AS name, email, branch FROM users
       WHERE hub_id = ? AND role = 'branch_manager'
       ORDER BY full_name`,
      [id]
    );

    // Get locations linked to this hub
    const [locations] = await pool.query(
      `SELECT id, name, address, governorate FROM locations
       WHERE hub_id = ?
       ORDER BY name`,
      [id]
    );

    // Get branches linked to this hub
    const [branches] = await pool.query(
      `SELECT b.id, b.name, b.length_km AS lengthKm, b.conductor_type AS conductorType, b.status,
              (SELECT COUNT(*) FROM \`lines\` l WHERE l.branch_id = b.id) AS lineCount,
              (SELECT COUNT(*) FROM transformers t
                INNER JOIN \`lines\` l ON t.line_id = l.id
                WHERE l.branch_id = b.id) AS transformerCount
       FROM branches b
       WHERE b.hub_id = ?
       ORDER BY b.name`,
      [id]
    );

    // Progress stats for this hub (entries by engineers in this hub)
    const [stats] = await pool.query(
      `SELECT
         COUNT(*) AS totalEntries,
         SUM(CASE WHEN pe.status = 'published' THEN 1 ELSE 0 END) AS publishedCount,
         SUM(CASE WHEN pe.status = 'submitted' THEN 1 ELSE 0 END) AS submittedCount,
         SUM(CASE WHEN pe.status = 'rejected' THEN 1 ELSE 0 END) AS rejectedCount,
         COALESCE(AVG(CASE WHEN pe.status = 'published' THEN pe.progress_pct END), 0) AS avgProgress,
         COALESCE(SUM(CASE WHEN pe.status = 'published' THEN pe.transformers_commissioned ELSE 0 END), 0) AS transformersCommissioned
       FROM progress_entries pe
       INNER JOIN users u ON pe.site_engineer_id = u.id
       WHERE u.hub_id = ?`,
      [id]
    );

    return res.json({
      success: true,
      data: {
        ...hub,
        managers,
        engineers,
        locations,
        branches,
        stats: stats[0],
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /hubs - create hub (it_engineer / trusted_admin only)
router.post('/', requireRoles('admin'), async (req, res, next) => {
  try {
    const { name, region } = req.body;
    if (!name || !region) {
      return res.status(400).json({ error: 'Name and region are required' });
    }
    const id = uuidv4();
    await pool.query(
      'INSERT INTO hubs (id, name, region) VALUES (?, ?, ?)',
      [id, name, region]
    );
    const [rows] = await pool.query('SELECT id, name, region FROM hubs WHERE id = ?', [id]);
    return res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Hub name already exists' });
    }
    next(err);
  }
});

// PATCH /hubs/:id - update hub
router.patch('/:id', requireRoles('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, region } = req.body;
    const [result] = await pool.query(
      `UPDATE hubs SET name = COALESCE(?, name), region = COALESCE(?, region), updated_at = NOW() WHERE id = ?`,
      [name || null, region || null, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Hub not found' });
    }
    const [rows] = await pool.query('SELECT id, name, region FROM hubs WHERE id = ?', [id]);
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

// DELETE /hubs/:id
router.delete('/:id', requireRoles('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query('DELETE FROM hubs WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Hub not found' });
    }
    return res.json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
