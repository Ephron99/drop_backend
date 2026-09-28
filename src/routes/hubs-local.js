const express = require('express');
const { authenticateJWT } = require('../middleware/auth-local');

const router = express.Router();

// Mock data
const mockHubs = [
  { id: '1', name: 'Cairo Hub', region: 'Cairo', branch_manager_count: 5, site_engineer_count: 10, branch_count: 8, line_count: 25, transformer_count: 50 },
  { id: '2', name: 'Alexandria Hub', region: 'Alexandria', branch_manager_count: 3, site_engineer_count: 6, branch_count: 5, line_count: 15, transformer_count: 30 },
];

router.get('/', authenticateJWT, (req, res) => {
  res.json({ success: true, data: mockHubs });
});

module.exports = router;
