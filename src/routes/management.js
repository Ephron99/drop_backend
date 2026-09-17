const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db/pool');
const { authenticateJWT, requireRoles } = require('../middleware/auth');

const router = express.Router();

// All management routes require authentication
router.use(authenticateJWT);

function newId() {
  return uuidv4();
}

// ============================================================
// PROJECTS
// ============================================================

router.get('/projects', async (req, res, next) => {
  try {
    const { status } = req.query;
    let sql = `
      SELECT p.id, p.code, p.name, p.description, p.status,
             p.start_date AS startDate, p.end_date AS endDate,
             p.total_budget AS totalBudget, p.created_by AS createdBy,
             p.created_at AS createdAt, p.updated_at AS updatedAt,
             u.full_name AS createdByName
      FROM projects p
      LEFT JOIN users u ON p.created_by = u.id
    `;
    const params = [];
    if (status) {
      sql += ' WHERE p.status = ?';
      params.push(status);
    }
    sql += ' ORDER BY p.created_at DESC';
    const [rows] = await pool.query(sql, params);
    return res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

router.get('/projects/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const [projects] = await pool.query(
      `SELECT p.id, p.code, p.name, p.description, p.status,
              p.start_date AS startDate, p.end_date AS endDate,
              p.total_budget AS totalBudget, p.created_by AS createdBy,
              p.created_at AS createdAt, p.updated_at AS updatedAt,
              u.full_name AS createdByName
       FROM projects p
       LEFT JOIN users u ON p.created_by = u.id
       WHERE p.id = ?`,
      [id]
    );
    if (projects.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const project = projects[0];

    const [budgetRows] = await pool.query(
      `SELECT
         COALESCE(SUM(planned_amount), 0) AS totalPlanned,
         COALESCE(SUM(spent_amount), 0) AS totalSpent,
         COALESCE(SUM(committed_amount), 0) AS totalCommitted
       FROM budget_items WHERE project_id = ?`,
      [id]
    );
    project.budgetSummary = budgetRows[0];

    const [fundRows] = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'allocation' THEN amount ELSE 0 END), 0) AS totalAllocated,
         COALESCE(SUM(CASE WHEN type = 'disbursement' THEN amount ELSE 0 END), 0) AS totalDisbursed,
         COALESCE(SUM(CASE WHEN type = 'commitment' THEN amount ELSE 0 END), 0) AS totalCommitted,
         COALESCE(SUM(CASE WHEN type = 'refund' THEN amount ELSE 0 END), 0) AS totalRefunded
       FROM fund_transactions WHERE project_id = ?`,
      [id]
    );
    project.fundSummary = fundRows[0];

    const [taskRows] = await pool.query(
      `SELECT
         COUNT(*) AS totalTasks,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completedTasks,
         SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS inProgressTasks,
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pendingTasks,
         SUM(CASE WHEN status = 'assigned' THEN 1 ELSE 0 END) AS assignedTasks,
         COALESCE(AVG(progress_pct), 0) AS avgProgress
       FROM tasks WHERE project_id = ?`,
      [id]
    );
    project.taskSummary = taskRows[0];

    const [scopeRows] = await pool.query(
      'SELECT COUNT(*) AS totalScopes FROM scopes WHERE project_id = ?',
      [id]
    );
    project.scopeCount = scopeRows[0].totalScopes;

    return res.json({ success: true, data: project });
  } catch (err) {
    next(err);
  }
});

router.post('/projects', requireRoles('hub_manager', 'senior_manager', 'admin'), async (req, res, next) => {
  try {
    const { code, name, description, status, startDate, endDate, totalBudget } = req.body;
    if (!code || !name) {
      return res.status(400).json({ error: 'Code and name are required' });
    }
    const id = newId();
    await pool.query(
      `INSERT INTO projects (id, code, name, description, status, start_date, end_date, total_budget, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        code,
        name,
        description || null,
        status || 'planning',
        startDate || null,
        endDate || null,
        totalBudget || 0,
        req.user.id,
      ]
    );
    const [rows] = await pool.query(
      `SELECT id, code, name, description, status,
              start_date AS startDate, end_date AS endDate,
              total_budget AS totalBudget, created_by AS createdBy,
              created_at AS createdAt
       FROM projects WHERE id = ?`,
      [id]
    );
    return res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Project code already exists' });
    }
    next(err);
  }
});

router.patch('/projects/:id', requireRoles('hub_manager', 'senior_manager', 'admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { code, name, description, status, startDate, endDate, totalBudget } = req.body;
    const [result] = await pool.query(
      `UPDATE projects SET
         code = COALESCE(?, code),
         name = COALESCE(?, name),
         description = COALESCE(?, description),
         status = COALESCE(?, status),
         start_date = COALESCE(?, start_date),
         end_date = COALESCE(?, end_date),
         total_budget = COALESCE(?, total_budget)
       WHERE id = ?`,
      [code || null, name || null, description || null, status || null, startDate || null, endDate || null, totalBudget ?? null, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const [rows] = await pool.query(
      `SELECT id, code, name, description, status,
              start_date AS startDate, end_date AS endDate,
              total_budget AS totalBudget, created_by AS createdBy,
              created_at AS createdAt, updated_at AS updatedAt
       FROM projects WHERE id = ?`,
      [id]
    );
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.delete('/projects/:id', requireRoles('hub_manager', 'senior_manager', 'admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query('DELETE FROM projects WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    return res.json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// SCOPES
// ============================================================

router.get('/scopes', async (req, res, next) => {
  try {
    const { projectId, status } = req.query;
    let sql = `
      SELECT s.id, s.project_id AS projectId, s.hub_id AS hubId, s.branch_id AS branchId,
             s.line_id AS lineId, s.transformer_id AS transformerId,
             s.name, s.description, s.status,
             s.planned_km AS plannedKm, s.planned_transformers AS plannedTransformers,
             s.budget_allocated AS budgetAllocated,
             s.created_by AS createdBy, s.approved_by AS approvedBy, s.approved_at AS approvedAt,
             s.created_at AS createdAt, s.updated_at AS updatedAt,
             p.name AS projectName, p.code AS projectCode,
             h.name AS hubName,
             b.name AS branchName,
             ln.name AS lineName,
             t.name AS transformerName,
             u.full_name AS createdByName
      FROM scopes s
      LEFT JOIN projects p ON s.project_id = p.id
      LEFT JOIN hubs h ON s.hub_id = h.id
      LEFT JOIN branches b ON s.branch_id = b.id
      LEFT JOIN \`lines\` ln ON s.line_id = ln.id
      LEFT JOIN transformers t ON s.transformer_id = t.id
      LEFT JOIN users u ON s.created_by = u.id
    `;
    const params = [];
    const conditions = [];
    if (projectId) {
      conditions.push('s.project_id = ?');
      params.push(projectId);
    }
    if (status) {
      conditions.push('s.status = ?');
      params.push(status);
    }
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY s.created_at DESC';
    const [rows] = await pool.query(sql, params);
    return res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/scopes', requireRoles('hub_manager', 'senior_manager', 'admin'), async (req, res, next) => {
  try {
    const { projectId, hubId, branchId, lineId, transformerId, name, description, status, plannedKm, plannedTransformers, budgetAllocated } = req.body;
    if (!projectId || !name) {
      return res.status(400).json({ error: 'Project ID and name are required' });
    }
    const id = newId();
    await pool.query(
      `INSERT INTO scopes (id, project_id, hub_id, branch_id, line_id, transformer_id, name, description, status, planned_km, planned_transformers, budget_allocated, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        projectId,
        hubId || null,
        branchId || null,
        lineId || null,
        transformerId || null,
        name,
        description || null,
        status || 'draft',
        plannedKm || 0,
        plannedTransformers || 0,
        budgetAllocated || 0,
        req.user.id,
      ]
    );
    const [rows] = await pool.query(
      `SELECT s.id, s.project_id AS projectId, s.hub_id AS hubId, s.branch_id AS branchId,
              s.line_id AS lineId, s.transformer_id AS transformerId,
              s.name, s.description, s.status,
              s.planned_km AS plannedKm, s.planned_transformers AS plannedTransformers,
              s.budget_allocated AS budgetAllocated,
              s.created_by AS createdBy, s.created_at AS createdAt,
              h.name AS hubName, b.name AS branchName, ln.name AS lineName, t.name AS transformerName
       FROM scopes s
       LEFT JOIN hubs h ON s.hub_id = h.id
       LEFT JOIN branches b ON s.branch_id = b.id
       LEFT JOIN \`lines\` ln ON s.line_id = ln.id
       LEFT JOIN transformers t ON s.transformer_id = t.id
       WHERE s.id = ?`,
      [id]
    );
    return res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.patch('/scopes/:id', requireRoles('hub_manager', 'senior_manager', 'admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { hubId, branchId, lineId, transformerId, name, description, status, plannedKm, plannedTransformers, budgetAllocated } = req.body;
    const [result] = await pool.query(
      `UPDATE scopes SET
         hub_id = COALESCE(?, hub_id),
         branch_id = COALESCE(?, branch_id),
         line_id = COALESCE(?, line_id),
         transformer_id = COALESCE(?, transformer_id),
         name = COALESCE(?, name),
         description = COALESCE(?, description),
         status = COALESCE(?, status),
         planned_km = COALESCE(?, planned_km),
         planned_transformers = COALESCE(?, planned_transformers),
         budget_allocated = COALESCE(?, budget_allocated)
       WHERE id = ?`,
      [hubId || null, branchId || null, lineId || null, transformerId || null, name || null, description || null, status || null, plannedKm ?? null, plannedTransformers ?? null, budgetAllocated ?? null, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Scope not found' });
    }
    const [rows] = await pool.query(
      `SELECT s.id, s.project_id AS projectId, s.hub_id AS hubId, s.branch_id AS branchId,
              s.line_id AS lineId, s.transformer_id AS transformerId,
              s.name, s.description, s.status,
              s.planned_km AS plannedKm, s.planned_transformers AS plannedTransformers,
              s.budget_allocated AS budgetAllocated,
              s.approved_by AS approvedBy, s.approved_at AS approvedAt,
              s.created_at AS createdAt, s.updated_at AS updatedAt,
              h.name AS hubName, b.name AS branchName, ln.name AS lineName, t.name AS transformerName
       FROM scopes s
       LEFT JOIN hubs h ON s.hub_id = h.id
       LEFT JOIN branches b ON s.branch_id = b.id
       LEFT JOIN \`lines\` ln ON s.line_id = ln.id
       LEFT JOIN transformers t ON s.transformer_id = t.id
       WHERE s.id = ?`,
      [id]
    );
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.post('/scopes/:id/approve', requireRoles('hub_manager', 'senior_manager', 'admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query(
      `UPDATE scopes SET status = 'approved', approved_by = ?, approved_at = NOW() WHERE id = ?`,
      [req.user.id, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Scope not found' });
    }
    const [rows] = await pool.query(
      `SELECT s.id, s.project_id AS projectId, s.name, s.status,
              s.approved_by AS approvedBy, s.approved_at AS approvedAt
       FROM scopes s WHERE s.id = ?`,
      [id]
    );
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.delete('/scopes/:id', requireRoles('hub_manager', 'senior_manager', 'admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query('DELETE FROM scopes WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Scope not found' });
    }
    return res.json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// TASKS
// ============================================================

router.get('/tasks', async (req, res, next) => {
  try {
    const { projectId, scopeId, assignedTo, status } = req.query;
    let sql = `
      SELECT t.id, t.project_id AS projectId, t.scope_id AS scopeId,
             t.title, t.description, t.status, t.priority,
             t.assigned_to AS assignedTo, t.assigned_by AS assignedBy,
             t.line_id AS lineId, t.transformer_id AS transformerId,
             t.planned_start_date AS plannedStartDate,
             t.planned_end_date AS plannedEndDate,
             t.actual_start_date AS actualStartDate,
             t.actual_end_date AS actualEndDate,
             t.progress_pct AS progressPct,
             t.created_at AS createdAt, t.updated_at AS updatedAt,
             p.name AS projectName, p.code AS projectCode,
             s.name AS scopeName,
             u.full_name AS assignedToName,
             ub.full_name AS assignedByName,
             l.name AS lineName,
             tr.name AS transformerName
      FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN scopes s ON t.scope_id = s.id
      LEFT JOIN users u ON t.assigned_to = u.id
      LEFT JOIN users ub ON t.assigned_by = ub.id
      LEFT JOIN \`lines\` l ON t.line_id = l.id
      LEFT JOIN transformers tr ON t.transformer_id = tr.id
    `;
    const params = [];
    const conditions = [];
    if (projectId) {
      conditions.push('t.project_id = ?');
      params.push(projectId);
    }
    if (scopeId) {
      conditions.push('t.scope_id = ?');
      params.push(scopeId);
    }
    if (assignedTo) {
      conditions.push('t.assigned_to = ?');
      params.push(assignedTo);
    }
    if (status) {
      conditions.push('t.status = ?');
      params.push(status);
    }
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY t.created_at DESC';
    const [rows] = await pool.query(sql, params);
    return res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/tasks', requireRoles('hub_manager', 'admin'), async (req, res, next) => {
  try {
    const {
      projectId, scopeId, title, description, status, priority,
      assignedTo, lineId, transformerId, plannedStartDate, plannedEndDate,
    } = req.body;
    if (!projectId || !title) {
      return res.status(400).json({ error: 'Project ID and title are required' });
    }
    const id = newId();
    const taskStatus = assignedTo ? (status || 'assigned') : (status || 'pending');
    await pool.query(
      `INSERT INTO tasks (id, project_id, scope_id, title, description, status, priority,
         assigned_to, assigned_by, line_id, transformer_id, planned_start_date, planned_end_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, projectId, scopeId || null, title, description || null,
        taskStatus, priority || 'medium',
        assignedTo || null, req.user.id, lineId || null, transformerId || null,
        plannedStartDate || null, plannedEndDate || null,
      ]
    );
    const [rows] = await pool.query(
      `SELECT t.id, t.project_id AS projectId, t.scope_id AS scopeId,
              t.title, t.description, t.status, t.priority,
              t.assigned_to AS assignedTo, t.assigned_by AS assignedBy,
              t.line_id AS lineId, t.transformer_id AS transformerId,
              t.planned_start_date AS plannedStartDate,
              t.planned_end_date AS plannedEndDate,
              t.progress_pct AS progressPct, t.created_at AS createdAt
       FROM tasks t WHERE t.id = ?`,
      [id]
    );
    return res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.patch('/tasks/:id', requireRoles('hub_manager', 'admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      title, description, status, priority, assignedTo, lineId, transformerId,
      plannedStartDate, plannedEndDate, actualStartDate, actualEndDate, progressPct,
    } = req.body;
    const [result] = await pool.query(
      `UPDATE tasks SET
         title = COALESCE(?, title),
         description = COALESCE(?, description),
         status = COALESCE(?, status),
         priority = COALESCE(?, priority),
         assigned_to = COALESCE(?, assigned_to),
         line_id = COALESCE(?, line_id),
         transformer_id = COALESCE(?, transformer_id),
         planned_start_date = COALESCE(?, planned_start_date),
         planned_end_date = COALESCE(?, planned_end_date),
         actual_start_date = COALESCE(?, actual_start_date),
         actual_end_date = COALESCE(?, actual_end_date),
         progress_pct = COALESCE(?, progress_pct)
       WHERE id = ?`,
      [
        title || null, description || null, status || null, priority || null,
        assignedTo ?? null, lineId ?? null, transformerId ?? null,
        plannedStartDate ?? null, plannedEndDate ?? null,
        actualStartDate ?? null, actualEndDate ?? null,
        progressPct ?? null, id,
      ]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    const [rows] = await pool.query(
      `SELECT t.id, t.project_id AS projectId, t.scope_id AS scopeId,
              t.title, t.description, t.status, t.priority,
              t.assigned_to AS assignedTo, t.assigned_by AS assignedBy,
              t.line_id AS lineId, t.transformer_id AS transformerId,
              t.planned_start_date AS plannedStartDate,
              t.planned_end_date AS plannedEndDate,
              t.actual_start_date AS actualStartDate,
              t.actual_end_date AS actualEndDate,
              t.progress_pct AS progressPct,
              t.created_at AS createdAt, t.updated_at AS updatedAt
       FROM tasks t WHERE t.id = ?`,
      [id]
    );
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.delete('/tasks/:id', requireRoles('hub_manager', 'admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query('DELETE FROM tasks WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    return res.json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// BUDGET ITEMS
// ============================================================

router.get('/budget-items', async (req, res, next) => {
  try {
    const { projectId, scopeId, category } = req.query;
    let sql = `
      SELECT b.id, b.project_id AS projectId, b.scope_id AS scopeId,
             b.category, b.description,
             b.planned_amount AS plannedAmount,
             b.spent_amount AS spentAmount,
             b.committed_amount AS committedAmount,
             b.status, b.created_at AS createdAt, b.updated_at AS updatedAt,
             p.name AS projectName, p.code AS projectCode,
             s.name AS scopeName
      FROM budget_items b
      LEFT JOIN projects p ON b.project_id = p.id
      LEFT JOIN scopes s ON b.scope_id = s.id
    `;
    const params = [];
    const conditions = [];
    if (projectId) {
      conditions.push('b.project_id = ?');
      params.push(projectId);
    }
    if (scopeId) {
      conditions.push('b.scope_id = ?');
      params.push(scopeId);
    }
    if (category) {
      conditions.push('b.category = ?');
      params.push(category);
    }
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY b.created_at DESC';
    const [rows] = await pool.query(sql, params);
    return res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/budget-items', requireRoles('hub_manager', 'admin'), async (req, res, next) => {
  try {
    const { projectId, scopeId, category, description, plannedAmount, spentAmount, committedAmount, status } = req.body;
    if (!projectId || !category) {
      return res.status(400).json({ error: 'Project ID and category are required' });
    }
    const id = newId();
    await pool.query(
      `INSERT INTO budget_items (id, project_id, scope_id, category, description, planned_amount, spent_amount, committed_amount, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, projectId, scopeId || null, category, description || null,
        plannedAmount || 0, spentAmount || 0, committedAmount || 0, status || 'planned',
      ]
    );
    const [rows] = await pool.query(
      `SELECT b.id, b.project_id AS projectId, b.scope_id AS scopeId,
              b.category, b.description,
              b.planned_amount AS plannedAmount,
              b.spent_amount AS spentAmount,
              b.committed_amount AS committedAmount,
              b.status, b.created_at AS createdAt
       FROM budget_items b WHERE b.id = ?`,
      [id]
    );
    return res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.patch('/budget-items/:id', requireRoles('hub_manager', 'admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { category, description, plannedAmount, spentAmount, committedAmount, status } = req.body;
    const [result] = await pool.query(
      `UPDATE budget_items SET
         category = COALESCE(?, category),
         description = COALESCE(?, description),
         planned_amount = COALESCE(?, planned_amount),
         spent_amount = COALESCE(?, spent_amount),
         committed_amount = COALESCE(?, committed_amount),
         status = COALESCE(?, status)
       WHERE id = ?`,
      [category || null, description || null, plannedAmount ?? null, spentAmount ?? null, committedAmount ?? null, status || null, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Budget item not found' });
    }
    const [rows] = await pool.query(
      `SELECT b.id, b.project_id AS projectId, b.scope_id AS scopeId,
              b.category, b.description,
              b.planned_amount AS plannedAmount,
              b.spent_amount AS spentAmount,
              b.committed_amount AS committedAmount,
              b.status, b.created_at AS createdAt, b.updated_at AS updatedAt
       FROM budget_items b WHERE b.id = ?`,
      [id]
    );
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.delete('/budget-items/:id', requireRoles('hub_manager', 'admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query('DELETE FROM budget_items WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Budget item not found' });
    }
    return res.json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// FUND TRANSACTIONS
// ============================================================

router.get('/funds', async (req, res, next) => {
  try {
    const { projectId, type } = req.query;
    let sql = `
      SELECT f.id, f.project_id AS projectId, f.type, f.amount,
             f.description, f.reference,
             f.transaction_date AS transactionDate,
             f.created_by AS createdBy, f.created_at AS createdAt,
             p.name AS projectName, p.code AS projectCode,
             u.full_name AS createdByName
      FROM fund_transactions f
      LEFT JOIN projects p ON f.project_id = p.id
      LEFT JOIN users u ON f.created_by = u.id
    `;
    const params = [];
    const conditions = [];
    if (projectId) {
      conditions.push('f.project_id = ?');
      params.push(projectId);
    }
    if (type) {
      conditions.push('f.type = ?');
      params.push(type);
    }
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY f.transaction_date DESC, f.created_at DESC';
    const [rows] = await pool.query(sql, params);
    return res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/funds', requireRoles('hub_manager', 'admin'), async (req, res, next) => {
  try {
    const { projectId, type, amount, description, reference, transactionDate } = req.body;
    if (!projectId || !type || !amount || !transactionDate) {
      return res.status(400).json({ error: 'Project ID, type, amount, and transaction date are required' });
    }
    const id = newId();
    await pool.query(
      `INSERT INTO fund_transactions (id, project_id, type, amount, description, reference, transaction_date, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, projectId, type, amount, description || null, reference || null, transactionDate, req.user.id]
    );
    const [rows] = await pool.query(
      `SELECT f.id, f.project_id AS projectId, f.type, f.amount,
              f.description, f.reference,
              f.transaction_date AS transactionDate,
              f.created_by AS createdBy, f.created_at AS createdAt
       FROM fund_transactions f WHERE f.id = ?`,
      [id]
    );
    return res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.delete('/funds/:id', requireRoles('hub_manager', 'admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query('DELETE FROM fund_transactions WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Fund transaction not found' });
    }
    return res.json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// BRANCHES (electrical branch lines / tap-offs)
// ============================================================

router.get('/branches', async (req, res, next) => {
  try {
    const { hubId } = req.query;
    let sql = `
      SELECT b.id, b.name, b.hub_id AS hubId, b.length_km AS lengthKm,
             b.conductor_type AS conductorType, b.status,
             b.created_at AS createdAt, b.updated_at AS updatedAt,
             h.name AS hubName,
             (SELECT COUNT(*) FROM \`lines\` l WHERE l.branch_id = b.id) AS lineCount,
             (SELECT COUNT(*) FROM transformers t
              INNER JOIN \`lines\` l ON t.line_id = l.id
              WHERE l.branch_id = b.id) AS transformerCount
      FROM branches b
      LEFT JOIN hubs h ON b.hub_id = h.id
    `;
    const params = [];
    if (hubId) {
      sql += ' WHERE b.hub_id = ?';
      params.push(hubId);
    }
    sql += ' ORDER BY b.name';
    const [rows] = await pool.query(sql, params);
    return res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/branches', requireRoles('hub_manager', 'admin'), async (req, res, next) => {
  try {
    const { name, hubId, lengthKm, conductorType, status } = req.body;
    if (!name || !hubId) {
      return res.status(400).json({ error: 'Name and hub ID are required' });
    }
    const id = newId();
    await pool.query(
      `INSERT INTO branches (id, name, hub_id, length_km, conductor_type, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, name, hubId, lengthKm || 0, conductorType || null, status || 'planned']
    );
    const [rows] = await pool.query(
      `SELECT b.id, b.name, b.hub_id AS hubId, b.length_km AS lengthKm,
              b.conductor_type AS conductorType, b.status, b.created_at AS createdAt
       FROM branches b WHERE b.id = ?`,
      [id]
    );
    return res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.patch('/branches/:id', requireRoles('hub_manager', 'admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, hubId, lengthKm, conductorType, status } = req.body;
    const [result] = await pool.query(
      `UPDATE branches SET
         name = COALESCE(?, name),
         hub_id = COALESCE(?, hub_id),
         length_km = COALESCE(?, length_km),
         conductor_type = COALESCE(?, conductor_type),
         status = COALESCE(?, status)
       WHERE id = ?`,
      [name || null, hubId ?? null, lengthKm ?? null, conductorType ?? null, status || null, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Branch not found' });
    }
    const [rows] = await pool.query(
      `SELECT b.id, b.name, b.hub_id AS hubId, b.length_km AS lengthKm,
              b.conductor_type AS conductorType, b.status,
              b.created_at AS createdAt, b.updated_at AS updatedAt
       FROM branches b WHERE b.id = ?`,
      [id]
    );
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.delete('/branches/:id', requireRoles('hub_manager', 'admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query('DELETE FROM branches WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Branch not found' });
    }
    return res.json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// PROGRESS MONITORING (aggregate against plans)
// ============================================================

router.get('/monitor/:projectId', async (req, res, next) => {
  try {
    const { projectId } = req.params;

    const [scopeProgress] = await pool.query(
      `SELECT
         s.id, s.name, s.status,
         s.planned_km AS plannedKm, s.planned_transformers AS plannedTransformers,
         s.budget_allocated AS budgetAllocated,
         (SELECT COALESCE(AVG(pe.progress_pct), 0)
          FROM progress_entries pe
          JOIN \`lines\` l ON pe.line_id = l.id
          WHERE l.location_id = s.location_id AND pe.status = 'published'
         ) AS actualProgressPct,
         (SELECT COALESCE(SUM(pe.transformers_commissioned), 0)
          FROM progress_entries pe
          JOIN \`lines\` l ON pe.line_id = l.id
          WHERE l.location_id = s.location_id AND pe.status = 'published'
         ) AS actualTransformers
       FROM scopes s
       WHERE s.project_id = ?
       ORDER BY s.name`,
      [projectId]
    );

    const [taskProgress] = await pool.query(
      `SELECT
         t.status, t.priority,
         COUNT(*) AS count,
         COALESCE(AVG(t.progress_pct), 0) AS avgProgress
       FROM tasks t
       WHERE t.project_id = ?
       GROUP BY t.status, t.priority`,
      [projectId]
    );

    const [budgetVsActual] = await pool.query(
      `SELECT
         b.category,
         COALESCE(SUM(b.planned_amount), 0) AS planned,
         COALESCE(SUM(b.spent_amount), 0) AS spent,
         COALESCE(SUM(b.committed_amount), 0) AS committed
       FROM budget_items b
       WHERE b.project_id = ?
       GROUP BY b.category
       ORDER BY b.category`,
      [projectId]
    );

    const [fundAvailability] = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'allocation' THEN amount ELSE 0 END), 0) AS allocated,
         COALESCE(SUM(CASE WHEN type = 'disbursement' THEN amount ELSE 0 END), 0) AS disbursed,
         COALESCE(SUM(CASE WHEN type = 'commitment' THEN amount ELSE 0 END), 0) AS committed,
         COALESCE(SUM(CASE WHEN type = 'refund' THEN amount ELSE 0 END), 0) AS refunded
       FROM fund_transactions
       WHERE project_id = ?`,
      [projectId]
    );

    return res.json({
      success: true,
      data: {
        scopeProgress,
        taskProgress,
        budgetVsActual,
        fundAvailability: fundAvailability[0],
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;