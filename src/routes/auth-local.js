const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const env = require('../config/env');
const authenticateJWT = require('../middleware/auth-local').authenticateJWT;
const { loginSchema, validate } = require('../middleware/validators');

const router = express.Router();

// Mock users for local development
const mockUsers = [
  {
    id: '1',
    email: 'twagirimanaephron1@gmail.com',
    password_hash: '$2b$10$YbRkP3zK9vQ3pGKjJ5m0E.z8xKzF5xKzF5xKzF5xKzF5xKzF5xKzF', // password123 hashed
    full_name: 'Branch Manager',
    role: 'branch_manager',
    branch: '1',
    hub_id: null,
    otp_code: null,
    otp_expires: null,
  },
  {
    id: '2',
    email: 'manager.southern@reg.rw',
    password_hash: '$2b$10$YbRkP3zK9vQ3pGKjJ5m0E.z8xKzF5xKzF5xKzF5xKzF5xKzF5xKzF',
    full_name: 'Hub Manager',
    role: 'hub_manager',
    branch: null,
    hub_id: '1',
    otp_code: null,
    otp_expires: null,
  },
  {
    id: '3',
    email: 'director@company.com',
    password_hash: '$2b$10$YbRkP3zK9vQ3pGKjJ5m0E.z8xKzF5xKzF5xKzF5xKzF5xKzF5xKzF',
    full_name: 'Senior Manager',
    role: 'senior_manager',
    branch: null,
    hub_id: null,
    otp_code: null,
    otp_expires: null,
  },
  {
    id: '4',
    email: 'superadmin@company.com',
    password_hash: '$2b$10$YbRkP3zK9vQ3pGKjJ5m0E.z8xKzF5xKzF5xKzF5xKzF5xKzF5xKzF',
    full_name: 'Admin',
    role: 'admin',
    branch: null,
    hub_id: null,
    otp_code: null,
    otp_expires: null,
  },
];

// Generate OTP code
function generateOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

// Verify OTP code
function verifyOTP(user, otp) {
  if (!user.otp_code || !user.otp_expires) return false;
  if (otp !== user.otp_code) return false;
  if (Date.now() > new Date(user.otp_expires).getTime()) return false;
  return true;
}

// Clear OTP for user
function clearOTP(user) {
  user.otp_code = null;
  user.otp_expires = null;
}

router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.validated;
    
    // Find user by email only (no role needed)
    const user = mockUsers.find(u => u.email === email);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // For local dev, just check password
    if (password !== 'password123') {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate OTP code
    const otpCode = generateOTP();
    user.otp_code = otpCode;
    user.otp_expires = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

    // In production, send OTP via email service
    // For local dev, log it to console
    console.log(`\n📧 OTP for ${user.email}: ${otpCode}`);
    console.log('This code expires in 10 minutes\n');

    // Issue temporary JWT token (valid for 10 minutes)
    const tempToken = jwt.sign(
      { id: user.id, role: user.role, name: user.full_name, hubId: user.hub_id || null },
      env.JWT_SECRET,
      { expiresIn: '10m' }
    );

    return res.json({
      success: true,
      data: {
        token: tempToken,
        message: 'Please check your email for the verification code',
        expiresIn: '10m',
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authenticateJWT, async (req, res, next) => {
  try {
    const user = mockUsers.find(u => u.id === req.user.id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    return res.json({ 
      success: true, 
      data: {
        id: user.id,
        email: user.email,
        name: user.full_name,
        role: user.role,
        branch: user.branch || null,
        hubId: user.hub_id || null,
        hubName: null,
        hubRegion: null,
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      } 
    });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', authenticateJWT, (_req, res) => {
  return res.json({ success: true, data: { message: 'Logged out' } });
});

// Verify OTP and issue JWT token
router.post('/verify-otp', async (req, res, next) => {
  try {
    console.log('Body received:', JSON.stringify(req.body));
    console.log('OTP received:', req.body.otp);
    console.log('Token received:', req.body.token);

    const { otp, token } = req.body;

    if (!token) {
      return res.status(401).json({ error: 'Missing authorization token' });
    }

    // Decode temp token to get user ID
    let decoded;
    try {
      decoded = jwt.verify(token, env.JWT_SECRET);
    } catch (err) {
      console.error('JWT verification failed:', err.message);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const userId = decoded.id;

    const user = mockUsers.find(u => u.id === userId);
    if (!user || !verifyOTP(user, otp)) {
      return res.status(401).json({ error: 'Invalid or expired verification code' });
    }

    // Clear OTP after successful verification
    clearOTP(user);

    // Issue final JWT token
    const finalToken = jwt.sign(
      { id: user.id, role: user.role, name: user.full_name, hubId: user.hub_id || null },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );

    return res.json({
      success: true,
      data: {
        token: finalToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.full_name,
          role: user.role,
          branch: user.branch || null,
          hubId: user.hub_id || null,
        },
        expiresIn: env.JWT_EXPIRES_IN,
      },
    });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Login session expired. Please login again.' });
    }
    next(err);
  }
});

// Resend OTP code
router.post('/resend-otp', async (req, res, next) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(401).json({ error: 'Missing authorization token' });
    }

    // Decode temp token to get user ID
    const decoded = jwt.verify(token, env.JWT_SECRET);
    const userId = decoded.id;

    const user = mockUsers.find(u => u.id === userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Generate new OTP
    const otpCode = generateOTP();
    user.otp_code = otpCode;
    user.otp_expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    console.log(`\n📧 New OTP for ${user.email}: ${otpCode}`);
    console.log('This code expires in 10 minutes\n');

    return res.json({
      success: true,
      data: { message: 'Verification code sent to your email' },
    });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Login session expired. Please login again.' });
    }
    next(err);
  }
});

module.exports = router;
