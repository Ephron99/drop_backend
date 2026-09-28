const jwt = require('jsonwebtoken');
const env = require('../config/env');

// Local mock authentication without database
const mockUsers = [
  { id: '1', email: 'twagirimanaephron1@gmail.com', role: 'branch_manager', full_name: 'Branch Manager', hub_id: null },
  { id: '2', email: 'manager.southern@reg.rw', role: 'hub_manager', full_name: 'Hub Manager', hub_id: '1' },
  { id: '3', email: 'director@company.com', role: 'senior_manager', full_name: 'Senior Manager', hub_id: null },
  { id: '4', email: 'superadmin@company.com', role: 'admin', full_name: 'Admin', hub_id: null },
];

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

    // For local dev, just use decoded token info (no database needed)
    req.user = {
      id: decoded.id,
      role: decoded.role,
      name: decoded.name,
      hubId: decoded.hubId || null,
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
