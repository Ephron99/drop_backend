const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db/pool');
const { authenticateJWT, requireRoles } = require('../middleware/auth');

const router = express.Router();

router.get('/locations', authenticateJWT, async (req, res, next) => {
  try {
    const { hubId } = req.query;
    let sql = `SELECT l.id, l.name, l.address, l.governorate, l.hub_id AS hubId,
                      h.name AS hubName
               FROM locations l
               LEFT JOIN hubs h ON l.hub_id = h.id`;
    const params = [];
    if (hubId) {
      sql += ' WHERE l.hub_id = ?';
      params.push(hubId);
    }
    sql += ' ORDER BY l.name';
    const [rows] = await pool.query(sql, params);
    return res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

router.get('/lines', authenticateJWT, async (req, res, next) => {
  try {
    const { branchId } = req.query;
    let sql =
      'SELECT id, name, voltage_level AS voltageLevel, branch_id AS branchId FROM `lines`';
    const params = [];
    if (branchId) {
      sql += ' WHERE branch_id = ?';
      params.push(branchId);
    }
    sql += ' ORDER BY name';
    const [rows] = await pool.query(sql, params);
    return res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

router.get('/transformers', authenticateJWT, async (req, res, next) => {
  try {
    const { lineId } = req.query;
    let sql =
      'SELECT id, name, serial_number AS serialNumber, capacity_kva AS capacityKVA, line_id AS lineId FROM transformers';
    const params = [];
    if (lineId) {
      sql += ' WHERE line_id = ?';
      params.push(lineId);
    }
    sql += ' ORDER BY name';
    const [rows] = await pool.query(sql, params);
    return res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// LOCATIONS CRUD
// ============================================================

router.post('/locations', authenticateJWT, requireRoles('hub_manager', 'admin'), async (req, res, next) => {
  try {
    const { name, address, governorate, hubId } = req.body;
    if (!name || !address || !governorate) {
      return res.status(400).json({ error: 'Name, address, and governorate are required' });
    }
    const id = uuidv4();
    await pool.query(
      'INSERT INTO locations (id, name, address, governorate, hub_id) VALUES (?, ?, ?, ?, ?)',
      [id, name, address, governorate, hubId || null]
    );
    const [rows] = await pool.query(
      `SELECT l.id, l.name, l.address, l.governorate, l.hub_id AS hubId, h.name AS hubName
       FROM locations l LEFT JOIN hubs h ON l.hub_id = h.id WHERE l.id = ?`,
      [id]
    );
    return res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.patch('/locations/:id', authenticateJWT, requireRoles('hub_manager', 'admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, address, governorate } = req.body;
    const [result] = await pool.query(
      `UPDATE locations SET
         name = COALESCE(?, name),
         address = COALESCE(?, address),
         governorate = COALESCE(?, governorate)
       WHERE id = ?`,
      [name || null, address || null, governorate || null, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Location not found' });
    }
    const [rows] = await pool.query(
      'SELECT id, name, address, governorate FROM locations WHERE id = ?',
      [id]
    );
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.delete('/locations/:id', authenticateJWT, requireRoles('hub_manager', 'admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query('DELETE FROM locations WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Location not found' });
    }
    return res.json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// LINES CRUD
// ============================================================

router.post('/lines', authenticateJWT, requireRoles('hub_manager', 'admin'), async (req, res, next) => {
  try {
    const { name, voltageLevel, branchId } = req.body;
    if (!name || !voltageLevel || !branchId) {
      return res.status(400).json({ error: 'Name, voltage level, and branch ID are required' });
    }
    const id = uuidv4();
    await pool.query(
      'INSERT INTO `lines` (id, name, voltage_level, branch_id) VALUES (?, ?, ?, ?)',
      [id, name, voltageLevel, branchId]
    );
    const [rows] = await pool.query(
      'SELECT id, name, voltage_level AS voltageLevel, branch_id AS branchId FROM `lines` WHERE id = ?',
      [id]
    );
    return res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.patch('/lines/:id', authenticateJWT, requireRoles('hub_manager', 'admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, voltageLevel, branchId } = req.body;
    const [result] = await pool.query(
      `UPDATE \`lines\` SET
         name = COALESCE(?, name),
         voltage_level = COALESCE(?, voltage_level),
         branch_id = COALESCE(?, branch_id)
       WHERE id = ?`,
      [name || null, voltageLevel || null, branchId ?? null, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Line not found' });
    }
    const [rows] = await pool.query(
      'SELECT id, name, voltage_level AS voltageLevel, branch_id AS branchId FROM `lines` WHERE id = ?',
      [id]
    );
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.delete('/lines/:id', authenticateJWT, requireRoles('hub_manager', 'admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query('DELETE FROM `lines` WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Line not found' });
    }
    return res.json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// TRANSFORMERS CRUD
// ============================================================

router.post('/transformers', authenticateJWT, requireRoles('hub_manager', 'admin'), async (req, res, next) => {
  try {
    const { name, serialNumber, capacityKVA, lineId } = req.body;
    if (!name || !serialNumber || !capacityKVA || !lineId) {
      return res.status(400).json({ error: 'Name, serial number, capacity, and line ID are required' });
    }
    const id = uuidv4();
    await pool.query(
      'INSERT INTO transformers (id, name, serial_number, capacity_kva, line_id) VALUES (?, ?, ?, ?, ?)',
      [id, name, serialNumber, capacityKVA, lineId]
    );
    const [rows] = await pool.query(
      'SELECT id, name, serial_number AS serialNumber, capacity_kva AS capacityKVA, line_id AS lineId FROM transformers WHERE id = ?',
      [id]
    );
    return res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Serial number already exists' });
    }
    next(err);
  }
});

router.patch('/transformers/:id', authenticateJWT, requireRoles('hub_manager', 'admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, serialNumber, capacityKVA, lineId } = req.body;
    const [result] = await pool.query(
      `UPDATE transformers SET
         name = COALESCE(?, name),
         serial_number = COALESCE(?, serial_number),
         capacity_kva = COALESCE(?, capacity_kva),
         line_id = COALESCE(?, line_id)
       WHERE id = ?`,
      [name || null, serialNumber || null, capacityKVA ?? null, lineId ?? null, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Transformer not found' });
    }
    const [rows] = await pool.query(
      'SELECT id, name, serial_number AS serialNumber, capacity_kva AS capacityKVA, line_id AS lineId FROM transformers WHERE id = ?',
      [id]
    );
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.delete('/transformers/:id', authenticateJWT, requireRoles('hub_manager', 'admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query('DELETE FROM transformers WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Transformer not found' });
    }
    return res.json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
