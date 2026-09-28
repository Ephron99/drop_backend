const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const env = require('./config/env');

const app = express();

app.use(cors({
  origin: env.CORS_ORIGIN.split(','),
  credentials: true,
}));

app.use(express.json());

// Mock users database
const users = [
  {
    id: '1',
    email: 'twagirimanaephron1@gmail.com',
    password: 'password123',
    name: 'Branch Manager',
    role: 'branch_manager',
    branchId: '1',
    hubId: null,
  },
  {
    id: '2',
    email: 'manager.southern@reg.rw',
    password: 'password123',
    name: 'Hub Manager',
    role: 'hub_manager',
    branchId: null,
    hubId: '1',
  },
  {
    id: '3',
    email: 'director@company.com',
    password: 'password123',
    name: 'Senior Manager',
    role: 'senior_manager',
    branchId: null,
    hubId: null,
  },
  {
    id: '4',
    email: 'superadmin@company.com',
    password: 'password123',
    name: 'Admin',
    role: 'admin',
    branchId: null,
    hubId: null,
  },
];

// Authentication
app.post('/api/auth/login', (req, res) => {
  const { email, password, role } = req.body;
  if (!role) {
    return res.status(400).json({ error: 'Role is required' });
  }
  const user = users.find(u => u.email === email && u.password === password && u.role === role);
  
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { id: user.id, role: user.role },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN }
  );

  res.json({
    success: true,
    data: {
      token,
      expiresIn: env.JWT_EXPIRES_IN,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        branchId: user.branchId,
        hubId: user.hubId,
      },
    },
  });
});

app.get('/api/auth/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    const user = users.find(u => u.id === decoded.id);
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        branchId: user.branchId,
        hubId: user.hubId,
      },
    });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.json({ success: true });
});

// Mock endpoints
app.get('/api/master/locations', (req, res) => {
  res.json({
    success: true,
    data: [
      { id: '1', name: 'Cairo', address: 'Cairo Governorate', governorate: 'Cairo' },
      { id: '2', name: 'Alexandria', address: 'Alexandria Governorate', governorate: 'Alexandria' },
    ],
  });
});

app.get('/api/master/lines', (req, res) => {
  res.json({
    success: true,
    data: [
      { id: '1', name: 'Line 1', voltageLevel: '22kV', branchId: null },
      { id: '2', name: 'Line 2', voltageLevel: '11kV', branchId: null },
    ],
  });
});

app.get('/api/master/transformers', (req, res) => {
  res.json({
    success: true,
    data: [
      { id: '1', name: 'Transformer 1', serialNumber: 'SN001', capacityKVA: 500, lineId: '1' },
      { id: '2', name: 'Transformer 2', serialNumber: 'SN002', capacityKVA: 300, lineId: '1' },
    ],
  });
});

app.get('/api/hubs', (req, res) => {
  res.json({
    success: true,
    data: [
      { id: '1', name: 'Cairo Hub', region: 'Cairo' },
      { id: '2', name: 'Alexandria Hub', region: 'Alexandria' },
    ],
  });
});

app.get('/api/progress', (req, res) => {
  res.json({
    success: true,
    data: [],
  });
});

app.get('/api/management/projects', (req, res) => {
  res.json({
    success: true,
    data: [],
  });
});

const PORT = env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`[MOCK SERVER] Voltage Drop backend running on http://localhost:${PORT}`);
  console.log(`[MOCK SERVER] Login credentials:`);
  console.log(`[MOCK SERVER] - branch_manager: twagirimanaephron1@gmail.com / password123`);
  console.log(`[MOCK SERVER] - hub_manager: manager.southern@reg.rw / password123`);
  console.log(`[MOCK SERVER] - senior_manager: director@company.com / password123`);
  console.log(`[MOCK SERVER] - admin: superadmin@company.com / password123`);
});

module.exports = app;
