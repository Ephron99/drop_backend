const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db/pool');
const { authenticateJWT, requireRoles } = require('../middleware/auth');

const router = express.Router();

router.use(authenticateJWT);

router.get('/locations', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, address, governorate, hub_id FROM locations ORDER BY name ASC'
    );

    return res.json({
      success: true,
      data: rows.map((row) => ({
        id: row.id,
        name: row.name,
        address: row.address,
        governorate: row.governorate,
        hubId: row.hub_id,
      })),
    });
  } catch (err) {
    console.error('GET /master/locations error:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error fetching locations.',
    });
  }
});

router.post('/locations', requireRoles('hub_manager', 'admin'), async (req, res) => {
  try {
    const { name, address, governorate, hubId } = req.body;
    if (!name || !address || !governorate) {
      return res.status(400).json({
        success: false,
        error: 'Name, address, and governorate are required.',
      });
    }
    const id = uuidv4();
    await pool.query(
      'INSERT INTO locations (id, name, address, governorate, hub_id) VALUES (?, ?, ?, ?, ?)',
      [id, name, address, governorate, hubId || null]
    );
    const [rows] = await pool.query(
      'SELECT id, name, address, governorate, hub_id FROM locations WHERE id = ? LIMIT 1',
      [id]
    );
    return res.status(201).json({
      success: true,
      data: {
        id: rows[0].id,
        name: rows[0].name,
        address: rows[0].address,
        governorate: rows[0].governorate,
        hubId: rows[0].hub_id,
      },
    });
  } catch (err) {
    console.error('POST /master/locations error:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error creating location.',
    });
  }
});

router.patch('/locations/:id', requireRoles('hub_manager', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, address, governorate, hubId } = req.body;
    const [result] = await pool.query(
      `UPDATE locations SET
         name = COALESCE(?, name),
         address = COALESCE(?, address),
         governorate = COALESCE(?, governorate),
         hub_id = COALESCE(?, hub_id)
       WHERE id = ?`,
      [name || null, address || null, governorate || null, hubId ?? null, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Location not found.',
      });
    }
    const [rows] = await pool.query(
      'SELECT id, name, address, governorate, hub_id FROM locations WHERE id = ? LIMIT 1',
      [id]
    );
    return res.json({
      success: true,
      data: {
        id: rows[0].id,
        name: rows[0].name,
        address: rows[0].address,
        governorate: rows[0].governorate,
        hubId: rows[0].hub_id,
      },
    });
  } catch (err) {
    console.error('PATCH /master/locations/:id error:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error updating location.',
    });
  }
});

router.delete('/locations/:id', requireRoles('hub_manager', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query('DELETE FROM locations WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Location not found.',
      });
    }
    return res.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /master/locations/:id error:', err);
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete this location because it is referenced by progress entries.',
      });
    }
    return res.status(500).json({
      success: false,
      error: 'Internal server error deleting location.',
    });
  }
});

router.get('/lines', async (req, res) => {
  try {
    const { branchId } = req.query;
    let query = 'SELECT id, name, voltage_level, branch_id FROM `lines`';
    const params = [];

    if (branchId) {
      query += ' WHERE branch_id = ?';
      params.push(branchId);
    }

    query += ' ORDER BY name ASC';

    const [rows] = await pool.query(query, params);

    return res.json({
      success: true,
      data: rows.map((row) => ({
        id: row.id,
        name: row.name,
        voltageLevel: row.voltage_level,
        branchId: row.branch_id,
      })),
    });
  } catch (err) {
    console.error('GET /master/lines error:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error fetching lines.',
    });
  }
});

router.post('/lines', requireRoles('hub_manager', 'admin'), async (req, res) => {
  try {
    const { name, voltageLevel, branchId } = req.body;
    if (!name || !voltageLevel || !branchId) {
      return res.status(400).json({
        success: false,
        error: 'Name, voltage level, and branch ID are required.',
      });
    }
    if (!['MV', 'LV'].includes(voltageLevel)) {
      return res.status(400).json({
        success: false,
        error: 'Voltage level must be MV or LV.',
      });
    }
    const id = uuidv4();
    await pool.query(
      'INSERT INTO `lines` (id, name, voltage_level, branch_id) VALUES (?, ?, ?, ?)',
      [id, name, voltageLevel, branchId]
    );
    const [rows] = await pool.query(
      'SELECT id, name, voltage_level, branch_id FROM `lines` WHERE id = ? LIMIT 1',
      [id]
    );
    return res.status(201).json({
      success: true,
      data: {
        id: rows[0].id,
        name: rows[0].name,
        voltageLevel: rows[0].voltage_level,
        branchId: rows[0].branch_id,
      },
    });
  } catch (err) {
    console.error('POST /master/lines error:', err);
    if (err.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({
        success: false,
        error: 'The specified branch does not exist.',
      });
    }
    return res.status(500).json({
      success: false,
      error: 'Internal server error creating line.',
    });
  }
});

router.patch('/lines/:id', requireRoles('hub_manager', 'admin'), async (req, res) => {
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
      return res.status(404).json({
        success: false,
        error: 'Line not found.',
      });
    }
    const [rows] = await pool.query(
      'SELECT id, name, voltage_level, branch_id FROM `lines` WHERE id = ? LIMIT 1',
      [id]
    );
    return res.json({
      success: true,
      data: {
        id: rows[0].id,
        name: rows[0].name,
        voltageLevel: rows[0].voltage_level,
        branchId: rows[0].branch_id,
      },
    });
  } catch (err) {
    console.error('PATCH /master/lines/:id error:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error updating line.',
    });
  }
});

router.delete('/lines/:id', requireRoles('hub_manager', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query('DELETE FROM `lines` WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Line not found.',
      });
    }
    return res.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /master/lines/:id error:', err);
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete this line because it has related transformers or progress entries.',
      });
    }
    return res.status(500).json({
      success: false,
      error: 'Internal server error deleting line.',
    });
  }
});

router.get('/transformers', async (req, res) => {
  try {
    const { lineId } = req.query;
    let query = 'SELECT id, name, serial_number, capacity_kva, line_id FROM transformers';
    const params = [];

    if (lineId) {
      query += ' WHERE line_id = ?';
      params.push(lineId);
    }

    query += ' ORDER BY name ASC';

    const [rows] = await pool.query(query, params);

    return res.json({
      success: true,
      data: rows.map((row) => ({
        id: row.id,
        name: row.name,
        serialNumber: row.serial_number,
        capacityKVA: row.capacity_kva,
        lineId: row.line_id,
      })),
    });
  } catch (err) {
    console.error('GET /master/transformers error:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error fetching transformers.',
    });
  }
});

router.post('/transformers', requireRoles('hub_manager', 'admin'), async (req, res) => {
  try {
    const { name, serialNumber, capacityKVA, lineId } = req.body;
    if (!name || !serialNumber || capacityKVA === undefined || !lineId) {
      return res.status(400).json({
        success: false,
        error: 'Name, serial number, capacity, and line ID are required.',
      });
    }
    const id = uuidv4();
    await pool.query(
      'INSERT INTO transformers (id, name, serial_number, capacity_kva, line_id) VALUES (?, ?, ?, ?, ?)',
      [id, name, serialNumber, capacityKVA, lineId]
    );
    const [rows] = await pool.query(
      'SELECT id, name, serial_number, capacity_kva, line_id FROM transformers WHERE id = ? LIMIT 1',
      [id]
    );
    return res.status(201).json({
      success: true,
      data: {
        id: rows[0].id,
        name: rows[0].name,
        serialNumber: rows[0].serial_number,
        capacityKVA: rows[0].capacity_kva,
        lineId: rows[0].line_id,
      },
    });
  } catch (err) {
    console.error('POST /master/transformers error:', err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        error: 'A transformer with this serial number already exists.',
      });
    }
    if (err.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({
        success: false,
        error: 'The specified line does not exist.',
      });
    }
    return res.status(500).json({
      success: false,
      error: 'Internal server error creating transformer.',
    });
  }
});

router.patch('/transformers/:id', requireRoles('hub_manager', 'admin'), async (req, res) => {
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
      return res.status(404).json({
        success: false,
        error: 'Transformer not found.',
      });
    }
    const [rows] = await pool.query(
      'SELECT id, name, serial_number, capacity_kva, line_id FROM transformers WHERE id = ? LIMIT 1',
      [id]
    );
    return res.json({
      success: true,
      data: {
        id: rows[0].id,
        name: rows[0].name,
        serialNumber: rows[0].serial_number,
        capacityKVA: rows[0].capacity_kva,
        lineId: rows[0].line_id,
      },
    });
  } catch (err) {
    console.error('PATCH /master/transformers/:id error:', err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        error: 'A transformer with this serial number already exists.',
      });
    }
    return res.status(500).json({
      success: false,
      error: 'Internal server error updating transformer.',
    });
  }
});

router.delete('/transformers/:id', requireRoles('hub_manager', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query('DELETE FROM transformers WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Transformer not found.',
      });
    }
    return res.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /master/transformers/:id error:', err);
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete this transformer because it is referenced by progress entries.',
      });
    }
    return res.status(500).json({
      success: false,
      error: 'Internal server error deleting transformer.',
    });
  }
});

router.get('/location/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      'SELECT id, name, address, governorate FROM locations WHERE id = ? LIMIT 1',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Location not found.',
      });
    }

    const row = rows[0];

    return res.json({
      success: true,
      data: {
        id: row.id,
        name: row.name,
        address: row.address,
        governorate: row.governorate,
      },
    });
  } catch (err) {
    console.error('GET /master/location/:id error:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error fetching location.',
    });
  }
});

module.exports = router;
