const express = require('express');
const { authenticateJWT } = require('../middleware/auth-local');

const router = express.Router();

// Mock data
const mockScopes = [
  { id: '1', name: 'Scope 1', description: 'Network upgrade in Cairo', budget: 500000, status: 'approved' },
  { id: '2', name: 'Scope 2', description: 'Transformer replacement', budget: 200000, status: 'pending' },
];

const mockBranches = [
  { id: '1', name: 'Branch 1', lengthKm: 25.5, conductorType: 'AAAC', status: 'active' },
  { id: '2', name: 'Branch 2', lengthKm: 18.3, conductorType: 'ACSR', status: 'planning' },
];

router.get('/scopes', authenticateJWT, (req, res) => {
  res.json({ success: true, data: mockScopes });
});

router.get('/branches', authenticateJWT, (req, res) => {
  res.json({ success: true, data: mockBranches });
});

module.exports = router;
