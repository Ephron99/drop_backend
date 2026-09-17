const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db/pool');
const { authenticateJWT, requireRoles } = require('../middleware/auth');
const {
  progressEntryCreateSchema,
  progressEntryUpdateSchema,
  rejectSchema,
  validate,
} = require('../middleware/validators');

const router = express.Router();

router.use(authenticateJWT);

const ENTRY_BASE_FIELDS = `
  pe.id, pe.entry_date, pe.location_id, pe.line_id, pe.voltage_level,
  pe.transformer_id, pe.progress_pct, pe.transformers_installed,
  pe.transformers_terminated, pe.transformers_tested, pe.transformers_commissioned,
  pe.status, pe.site_engineer_id, pe.submitted_at, pe.branch_manager_id,
  pe.approved_at, pe.published_at, pe.rejection_comments,
  pe.created_at, pe.updated_at
`;

const serializeEntry = (row) => ({
  id: row.id,
  entryDate: row.entry_date,
  locationId: row.location_id,
  lineId: row.line_id,
  voltageLevel: row.voltage_level,
  transformerId: row.transformer_id,
  progressPct: row.progress_pct,
  transformersInstalled: row.transformers_installed,
  transformersTerminated: row.transformers_terminated,
  transformersTested: row.transformers_tested,
  transformersCommissioned: row.transformers_commissioned,
  status: row.status,
  siteEngineerId: row.site_engineer_id,
  siteEngineerName: row.site_engineer_name || undefined,
  submittedAt: row.submitted_at,
  branchManagerId: row.branch_manager_id,
  branchManagerName: row.branch_manager_name || undefined,
  approvedAt: row.approved_at,
  publishedAt: row.published_at,
  rejectionComments: row.rejection_comments || undefined,
  locationName: row.location_name || undefined,
  lineName: row.line_name || undefined,
  transformerName: row.transformer_name || undefined,
  branch: row.branch || undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

router.get('/', async (req, res) => {
  try {
    const { status, engineerId, branch } = req.query;
    const { role, userId } = req.user;

    const conditions = [];
    const params = [];

    // branch_manager sees own entries; hub_manager/senior_manager/admin see everything
    if (role === 'branch_manager') {
      conditions.push('pe.site_engineer_id = ?');
      params.push(userId);
    } else if (role === 'hub_manager') {
      const [userRows] = await pool.query('SELECT branch FROM users WHERE id = ? LIMIT 1', [userId]);
      const userBranch = userRows[0]?.branch;
      if (userBranch) {
        conditions.push('se.branch = ?');
        params.push(userBranch);
      }
    }

    if (status) {
      conditions.push('pe.status = ?');
      params.push(status);
    }
    if (engineerId) {
      conditions.push('pe.site_engineer_id = ?');
      params.push(engineerId);
    }
    if (branch) {
      conditions.push('se.branch = ?');
      params.push(branch);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT
        ${ENTRY_BASE_FIELDS},
        se.name AS site_engineer_name,
        se.branch AS branch,
        bm.name AS branch_manager_name,
        loc.name AS location_name,
        ln.name AS line_name,
        tr.name AS transformer_name
      FROM progress_entries pe
      LEFT JOIN users se ON pe.site_engineer_id = se.id
      LEFT JOIN users bm ON pe.branch_manager_id = bm.id
      LEFT JOIN locations loc ON pe.location_id = loc.id
      LEFT JOIN lines ln ON pe.line_id = ln.id
      LEFT JOIN transformers tr ON pe.transformer_id = tr.id
      ${whereClause}
      ORDER BY pe.created_at DESC
    `;

    const [rows] = await pool.query(query, params);

    return res.json({
      success: true,
      data: rows.map(serializeEntry),
    });
  } catch (err) {
    console.error('GET /progress-entries error:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error fetching progress entries.',
    });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { role, userId } = req.user;

    const query = `
      SELECT
        ${ENTRY_BASE_FIELDS},
        se.name AS site_engineer_name,
        se.branch AS branch,
        bm.name AS branch_manager_name,
        loc.name AS location_name,
        loc.address AS location_address,
        loc.governorate AS location_governorate,
        ln.name AS line_name,
        ln.voltage_level AS line_voltage_level,
        tr.name AS transformer_name,
        tr.serial_number AS transformer_serial_number,
        tr.capacity_kva AS transformer_capacity_kva
      FROM progress_entries pe
      LEFT JOIN users se ON pe.site_engineer_id = se.id
      LEFT JOIN users bm ON pe.branch_manager_id = bm.id
      LEFT JOIN locations loc ON pe.location_id = loc.id
      LEFT JOIN lines ln ON pe.line_id = ln.id
      LEFT JOIN transformers tr ON pe.transformer_id = tr.id
      WHERE pe.id = ?
      LIMIT 1
    `;

    const [rows] = await pool.query(query, [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Progress entry not found.',
      });
    }

    const entry = rows[0];

    if (role === 'branch_manager' && entry.site_engineer_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. You can only view your own entries.',
      });
    }

    if (role === 'branch_manager') {
      const [userRows] = await pool.query('SELECT branch FROM users WHERE id = ? LIMIT 1', [userId]);
      const userBranch = userRows[0]?.branch;
      if (userBranch && entry.branch !== userBranch) {
        return res.status(403).json({
          success: false,
          error: 'Access denied. You can only view entries from your branch.',
        });
      }
    }

    const result = serializeEntry(entry);
    result.location = entry.location_name
      ? {
          id: entry.location_id,
          name: entry.location_name,
          address: entry.location_address,
          governorate: entry.location_governorate,
        }
      : undefined;
    result.line = entry.line_name
      ? {
          id: entry.line_id,
          name: entry.line_name,
          voltageLevel: entry.line_voltage_level,
        }
      : undefined;
    result.transformer = entry.transformer_name
      ? {
          id: entry.transformer_id,
          name: entry.transformer_name,
          serialNumber: entry.transformer_serial_number,
          capacityKVA: entry.transformer_capacity_kva,
        }
      : undefined;

    return res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    console.error('GET /progress-entries/:id error:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error fetching progress entry.',
    });
  }
});

router.post('/', requireRoles('branch_manager', 'admin'), validate(progressEntryCreateSchema), async (req, res) => {
  try {
    const id = uuidv4();
    const { userId } = req.user;
    const now = new Date();

    const {
      entryDate,
      locationId,
      lineId,
      voltageLevel,
      transformerId,
      progressPct,
      transformersInstalled,
      transformersTerminated,
      transformersTested,
      transformersCommissioned,
    } = req.body;

    await pool.query(
      `INSERT INTO progress_entries (
        id, entry_date, location_id, line_id, voltage_level, transformer_id,
        progress_pct, transformers_installed, transformers_terminated,
        transformers_tested, transformers_commissioned, status,
        site_engineer_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
      [
        id, entryDate, locationId, lineId, voltageLevel, transformerId,
        progressPct, transformersInstalled, transformersTerminated,
        transformersTested, transformersCommissioned, userId, now, now,
      ]
    );

    const query = `
      SELECT
        ${ENTRY_BASE_FIELDS},
        se.name AS site_engineer_name
      FROM progress_entries pe
      LEFT JOIN users se ON pe.site_engineer_id = se.id
      WHERE pe.id = ?
      LIMIT 1
    `;
    const [rows] = await pool.query(query, [id]);

    return res.status(201).json({
      success: true,
      data: serializeEntry(rows[0]),
    });
  } catch (err) {
    console.error('POST /progress-entries error:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error creating progress entry.',
    });
  }
});

router.put('/:id', validate(progressEntryUpdateSchema), async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, role } = req.user;

    const [existingRows] = await pool.query(
      'SELECT id, site_engineer_id, status FROM progress_entries WHERE id = ? LIMIT 1',
      [id]
    );

    if (existingRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Progress entry not found.',
      });
    }

    const entry = existingRows[0];

    if (entry.site_engineer_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Only the Branch Manager who created this entry can update it.',
      });
    }

    const editableStatuses = ['draft', 'rejected'];
    if (!editableStatuses.includes(entry.status)) {
      return res.status(400).json({
        success: false,
        error: `Entry cannot be updated while status is '${entry.status}'. Only 'draft' or 'rejected' entries can be modified.`,
      });
    }

    const {
      entryDate, locationId, lineId, voltageLevel, transformerId,
      progressPct, transformersInstalled, transformersTerminated,
      transformersTested, transformersCommissioned,
    } = req.body;

    const fields = [];
    const params = [];

    if (entryDate !== undefined) { fields.push('entry_date = ?'); params.push(entryDate); }
    if (locationId !== undefined) { fields.push('location_id = ?'); params.push(locationId); }
    if (lineId !== undefined) { fields.push('line_id = ?'); params.push(lineId); }
    if (voltageLevel !== undefined) { fields.push('voltage_level = ?'); params.push(voltageLevel); }
    if (transformerId !== undefined) { fields.push('transformer_id = ?'); params.push(transformerId); }
    if (progressPct !== undefined) { fields.push('progress_pct = ?'); params.push(progressPct); }
    if (transformersInstalled !== undefined) { fields.push('transformers_installed = ?'); params.push(transformersInstalled); }
    if (transformersTerminated !== undefined) { fields.push('transformers_terminated = ?'); params.push(transformersTerminated); }
    if (transformersTested !== undefined) { fields.push('transformers_tested = ?'); params.push(transformersTested); }
    if (transformersCommissioned !== undefined) { fields.push('transformers_commissioned = ?'); params.push(transformersCommissioned); }

    if (fields.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields provided for update.',
      });
    }

    fields.push('status = ?');
    params.push('draft');
    fields.push('updated_at = NOW()');

    params.push(id);

    await pool.query(`UPDATE progress_entries SET ${fields.join(', ')} WHERE id = ?`, params);

    const query = `
      SELECT
        ${ENTRY_BASE_FIELDS},
        se.name AS site_engineer_name
      FROM progress_entries pe
      LEFT JOIN users se ON pe.site_engineer_id = se.id
      WHERE pe.id = ?
      LIMIT 1
    `;
    const [rows] = await pool.query(query, [id]);

    return res.json({
      success: true,
      data: serializeEntry(rows[0]),
    });
  } catch (err) {
    console.error('PUT /progress-entries/:id error:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error updating progress entry.',
    });
  }
});

router.patch('/:id/submit', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, role } = req.user;

    const [existingRows] = await pool.query(
      'SELECT id, site_engineer_id, status FROM progress_entries WHERE id = ? LIMIT 1',
      [id]
    );

    if (existingRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Progress entry not found.',
      });
    }

    const entry = existingRows[0];

    const isOwner = entry.site_engineer_id === userId;
    const isAdmin = (role === 'admin' || role === 'hub_manager');

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Only the entry owner or a trusted admin can submit this entry.',
      });
    }

    const submittableStatuses = ['draft', 'rejected'];
    if (!submittableStatuses.includes(entry.status)) {
      return res.status(400).json({
        success: false,
        error: `Cannot submit entry with status '${entry.status}'. Only 'draft' or 'rejected' entries can be submitted.`,
      });
    }

    await pool.query(
      "UPDATE progress_entries SET status = 'submitted', submitted_at = NOW(), updated_at = NOW() WHERE id = ?",
      [id]
    );

    const query = `
      SELECT
        ${ENTRY_BASE_FIELDS},
        se.name AS site_engineer_name
      FROM progress_entries pe
      LEFT JOIN users se ON pe.site_engineer_id = se.id
      WHERE pe.id = ?
      LIMIT 1
    `;
    const [rows] = await pool.query(query, [id]);

    return res.json({
      success: true,
      data: serializeEntry(rows[0]),
    });
  } catch (err) {
    console.error('PATCH /progress-entries/:id/submit error:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error submitting progress entry.',
    });
  }
});

router.patch('/:id/approve', requireRoles('hub_manager', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.user;

    const [existingRows] = await pool.query(
      'SELECT id, status FROM progress_entries WHERE id = ? LIMIT 1',
      [id]
    );

    if (existingRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Progress entry not found.',
      });
    }

    const entry = existingRows[0];

    if (entry.status !== 'submitted') {
      return res.status(400).json({
        success: false,
        error: `Cannot approve entry with status '${entry.status}'. Only 'submitted' entries can be approved.`,
      });
    }

    await pool.query(
      "UPDATE progress_entries SET status = 'approved', branch_manager_id = ?, approved_at = NOW(), updated_at = NOW() WHERE id = ?",
      [userId, id]
    );

    const query = `
      SELECT
        ${ENTRY_BASE_FIELDS},
        se.name AS site_engineer_name,
        bm.name AS branch_manager_name
      FROM progress_entries pe
      LEFT JOIN users se ON pe.site_engineer_id = se.id
      LEFT JOIN users bm ON pe.branch_manager_id = bm.id
      WHERE pe.id = ?
      LIMIT 1
    `;
    const [rows] = await pool.query(query, [id]);

    return res.json({
      success: true,
      data: serializeEntry(rows[0]),
    });
  } catch (err) {
    console.error('PATCH /progress-entries/:id/approve error:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error approving progress entry.',
    });
  }
});

router.patch('/:id/reject', requireRoles('hub_manager', 'admin'), validate(rejectSchema), async (req, res) => {
  try {
    const { id } = req.params;
    const { comments } = req.body;

    const [existingRows] = await pool.query(
      'SELECT id, status FROM progress_entries WHERE id = ? LIMIT 1',
      [id]
    );

    if (existingRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Progress entry not found.',
      });
    }

    const entry = existingRows[0];

    if (entry.status !== 'submitted') {
      return res.status(400).json({
        success: false,
        error: `Cannot reject entry with status '${entry.status}'. Only 'submitted' entries can be rejected.`,
      });
    }

    await pool.query(
      "UPDATE progress_entries SET status = 'rejected', rejection_comments = ?, updated_at = NOW() WHERE id = ?",
      [comments, id]
    );

    const query = `
      SELECT
        ${ENTRY_BASE_FIELDS},
        se.name AS site_engineer_name,
        bm.name AS branch_manager_name
      FROM progress_entries pe
      LEFT JOIN users se ON pe.site_engineer_id = se.id
      LEFT JOIN users bm ON pe.branch_manager_id = bm.id
      WHERE pe.id = ?
      LIMIT 1
    `;
    const [rows] = await pool.query(query, [id]);

    return res.json({
      success: true,
      data: serializeEntry(rows[0]),
    });
  } catch (err) {
    console.error('PATCH /progress-entries/:id/reject error:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error rejecting progress entry.',
    });
  }
});

router.patch('/:id/publish', requireRoles('hub_manager', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.user;

    const [existingRows] = await pool.query(
      'SELECT id, status, branch_manager_id FROM progress_entries WHERE id = ? LIMIT 1',
      [id]
    );

    if (existingRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Progress entry not found.',
      });
    }

    const entry = existingRows[0];
    const publishableStatuses = ['submitted', 'approved'];

    if (!publishableStatuses.includes(entry.status)) {
      return res.status(400).json({
        success: false,
        error: `Cannot publish entry with status '${entry.status}'. Only 'submitted' or 'approved' entries can be published.`,
      });
    }

    const branchManagerId = entry.branch_manager_id || userId;

    await pool.query(
      "UPDATE progress_entries SET status = 'published', published_at = NOW(), branch_manager_id = ?, updated_at = NOW() WHERE id = ?",
      [branchManagerId, id]
    );

    const query = `
      SELECT
        ${ENTRY_BASE_FIELDS},
        se.name AS site_engineer_name,
        bm.name AS branch_manager_name
      FROM progress_entries pe
      LEFT JOIN users se ON pe.site_engineer_id = se.id
      LEFT JOIN users bm ON pe.branch_manager_id = bm.id
      WHERE pe.id = ?
      LIMIT 1
    `;
    const [rows] = await pool.query(query, [id]);

    return res.json({
      success: true,
      data: serializeEntry(rows[0]),
    });
  } catch (err) {
    console.error('PATCH /progress-entries/:id/publish error:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error publishing progress entry.',
    });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, role } = req.user;

    const [existingRows] = await pool.query(
      'SELECT id, site_engineer_id, status FROM progress_entries WHERE id = ? LIMIT 1',
      [id]
    );

    if (existingRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Progress entry not found.',
      });
    }

    const entry = existingRows[0];
    const isAdmin = (role === 'admin' || role === 'hub_manager');
    const isOwner = entry.site_engineer_id === userId;
    const deletableStatuses = ['draft', 'rejected'];

    if (!isAdmin && !(isOwner && deletableStatuses.includes(entry.status))) {
      if (!isAdmin && !isOwner) {
        return res.status(403).json({
          success: false,
          error: 'Access denied. Only the entry owner or a trusted admin can delete this entry.',
        });
      }
      return res.status(400).json({
        success: false,
        error: `Entry cannot be deleted while status is '${entry.status}'. Only 'draft' or 'rejected' entries can be deleted by the owner.`,
      });
    }

    await pool.query('DELETE FROM progress_entries WHERE id = ?', [id]);

    return res.json({
      success: true,
      data: { deleted: true, id },
    });
  } catch (err) {
    console.error('DELETE /progress-entries/:id error:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error deleting progress entry.',
    });
  }
});

module.exports = router;
