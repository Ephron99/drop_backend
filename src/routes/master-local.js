const express = require('express');
const { authenticateJWT } = require('../middleware/auth-local');

const router = express.Router();

// Mock data for local development
const mockLocations = [
  { id: '1', name: 'Cairo', address: 'Cairo Governorate', governorate: 'Cairo', hubId: '1', hubName: 'Cairo Hub' },
  { id: '2', name: 'Alexandria', address: 'Alexandria Governorate', governorate: 'Alexandria', hubId: '2', hubName: 'Alexandria Hub' },
];

const mockLines = [
  { id: '1', name: 'Line 1', voltageLevel: '22kV', branchId: '1' },
  { id: '2', name: 'Line 2', voltageLevel: '11kV', branchId: '1' },
];

const mockTransformers = [
  { id: '1', name: 'Transformer 1', serialNumber: 'SN001', capacityKVA: 500, lineId: '1' },
  { id: '2', name: 'Transformer 2', serialNumber: 'SN002', capacityKVA: 300, lineId: '1' },
];

router.get('/locations', authenticateJWT, (req, res) => {
  const { hubId } = req.query;
  let data = mockLocations;
  if (hubId) {
    data = mockLocations.filter(l => l.hubId === hubId);
  }
  res.json({ success: true, data });
});

router.get('/lines', authenticateJWT, (req, res) => {
  const { branchId } = req.query;
  let data = mockLines;
  if (branchId) {
    data = mockLines.filter(l => l.branchId === branchId);
  }
  res.json({ success: true, data });
});

router.get('/transformers', authenticateJWT, (req, res) => {
  const { lineId } = req.query;
  let data = mockTransformers;
  if (lineId) {
    data = mockTransformers.filter(t => t.lineId === lineId);
  }
  res.json({ success: true, data });
});

module.exports = router;
