const express = require('express');
const { authenticateJWT } = require('../middleware/auth-local');

const router = express.Router();

// Mock data
const mockEntries = [
  {
    id: '1',
    entryDate: '2026-09-20',
    locationId: '1',
    lineId: '1',
    voltageLevel: '22kV',
    transformerId: '1',
    progressPct: 75,
    transformersInstalled: 10,
    transformersTerminated: 8,
    transformersTested: 5,
    transformersCommissioned: 3,
    status: 'published',
    siteEngineerId: '5',
    siteEngineerName: 'John Doe',
    submittedAt: '2026-09-20',
    branchManagerId: '1',
    branchManagerName: 'Branch Manager',
    approvedAt: '2026-09-21',
    publishedAt: '2026-09-22',
    locationName: 'Cairo',
    lineName: 'Line 1',
    transformerName: 'Transformer 1',
    branch: '1',
    createdAt: '2026-09-20',
    updatedAt: '2026-09-22',
  },
  {
    id: '2',
    entryDate: '2026-09-22',
    locationId: '2',
    lineId: '2',
    voltageLevel: '11kV',
    transformerId: '2',
    progressPct: 50,
    transformersInstalled: 5,
    transformersTerminated: 3,
    transformersTested: 1,
    transformersCommissioned: 0,
    status: 'submitted',
    siteEngineerId: '6',
    siteEngineerName: 'Jane Smith',
    submittedAt: '2026-09-22',
    locationName: 'Alexandria',
    lineName: 'Line 2',
    transformerName: 'Transformer 2',
    createdAt: '2026-09-22',
    updatedAt: '2026-09-22',
  },
];

router.get('/', authenticateJWT, (req, res) => {
  let data = mockEntries;
  const { status, engineerId, branch } = req.query;
  
  if (status) {
    data = data.filter(e => e.status === status);
  }
  if (engineerId) {
    data = data.filter(e => e.siteEngineerId === engineerId);
  }
  if (branch) {
    data = data.filter(e => e.branch === branch);
  }
  
  res.json({ success: true, data });
});

module.exports = router;
