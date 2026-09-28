const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { Resend } = require('resend');
const env = require('../config/env');

const router = express.Router();

// Initialize Resend email service
const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

// Generate OTP code
function generateOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

// In-memory OTP storage (for local dev without DB)
const otpStorage = new Map();

// Send OTP via email (or log to console if no email service configured)
async function sendOTPEmail(email, otpCode) {
  if (!resend) {
    // Fallback to console logging if no Resend API key configured
    console.log(`\n📧 OTP for ${email}: ${otpCode}`);
    console.log('This code expires in 10 minutes\n');
    console.log('ℹ️  To enable email delivery, set RESEND_API_KEY in your .env file');
    console.log('   Get one at: https://resend.com\n');
    return;
  }

  try {
    const { data, error } = await resend.emails.send({
      from: env.EMAIL_FROM || 'Voltage-Drop <onboarding@resend.dev>',
      to: [email],
      subject: 'Your Login Verification Code',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333;">Voltage-Drop Login Verification</h2>
          <p style="color: #666; font-size: 16px;">Your one-time verification code is:</p>
          <div style="background-color: #f5f5f5; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
            <span style="font-size: 32px; font-weight: bold; color: #333; letter-spacing: 8px;">${otpCode}</span>
          </div>
          <p style="color: #666; font-size: 14px;">This code will expire in 10 minutes.</p>
          <p style="color: #999; font-size: 12px; margin-top: 20px;">If you didn't request this code, please ignore this email.</p>
        </div>
      `,
    });

    if (error) {
      console.error('Error sending email:', error);
      throw error;
    }

    console.log(`Email sent successfully to ${email}. Message ID: ${data.id}`);
  } catch (error) {
    console.error('Failed to send email:', error);
    throw error;
  }
}

// Demo users for local development
const demoUsers = [
  {
    id: '1',
    email: 'twagirimanaephron1@gmail.com',
    password_hash: '$2b$10$YbRkP3zK9vQ3pGKjJ5m0E.z8xKzF5xKzF5xKzF5xKzF5xKzF5xKzF',
    full_name: 'Branch Manager',
    role: 'branch_manager',
    branch: '1',
    hub_id: null,
  },
  {
    id: '2',
    email: 'manager.southern@reg.rw',
    password_hash: '$2b$10$YbRkP3zK9vQ3pGKjJ5m0E.z8xKzF5xKzF5xKzF5xKzF5xKzF5xKzF',
    full_name: 'Hub Manager',
    role: 'hub_manager',
    branch: null,
    hub_id: '1',
  },
  {
    id: '3',
    email: 'director@company.com',
    password_hash: '$2b$10$YbRkP3zK9vQ3pGKjJ5m0E.z8xKzF5xKzF5xKzF5xKzF5xKzF5xKzF',
    full_name: 'Senior Manager',
    role: 'senior_manager',
    branch: null,
    hub_id: null,
  },
  {
    id: '4',
    email: 'superadmin@company.com',
    password_hash: '$2b$10$YbRkP3zK9vQ3pGKjJ5m0E.z8xKzF5xKzF5xKzF5xKzF5xKzF5xKzF',
    full_name: 'Admin',
    role: 'admin',
    branch: null,
    hub_id: null,
  },
];

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = demoUsers.find(u => u.email === email);

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // For local dev, just check password
    if (password !== 'password123') {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate OTP code
    const otpCode = generateOTP();
    
    // Store OTP in memory
    otpStorage.set(user.id, {
      code: otpCode,
      expires: new Date(Date.now() + 10 * 60 * 1000)
    });

    // Send OTP via email
    await sendOTPEmail(user.email, otpCode);

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
    console.error('Login error:', err);
    next(err);
  }
});

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

    // Verify OTP
    const otpData = otpStorage.get(userId);
    if (!otpData || otpData.code !== otp || Date.now() > otpData.expires.getTime()) {
      return res.status(401).json({ error: 'Invalid or expired verification code' });
    }

    // Clear OTP after successful verification
    otpStorage.delete(userId);

    // Issue final JWT token
    const user = demoUsers.find(u => u.id === userId);
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
    console.error('Verify OTP error:', err);
    next(err);
  }
});

router.post('/resend-otp', async (req, res, next) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(401).json({ error: 'Missing authorization token' });
    }

    // Decode temp token to get user ID
    const decoded = jwt.verify(token, env.JWT_SECRET);
    const userId = decoded.id;

    // Get user
    const user = demoUsers.find(u => u.id === userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Generate new OTP
    const otpCode = generateOTP();
    
    // Store new OTP in memory
    otpStorage.set(userId, {
      code: otpCode,
      expires: new Date(Date.now() + 10 * 60 * 1000)
    });

    // Send new OTP via email
    await sendOTPEmail(user.email, otpCode);

    return res.json({
      success: true,
      data: { message: 'Verification code sent to your email' },
    });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Login session expired. Please login again.' });
    }
    console.error('Resend OTP error:', err);
    next(err);
  }
});

router.get('/me', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, env.JWT_SECRET);
    const user = demoUsers.find(u => u.id === decoded.id);

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
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      }
    });
  } catch (err) {
    console.error('Me error:', err);
    res.status(401).json({ error: 'Invalid token' });
  }
});

router.post('/logout', (_req, res) => {
  return res.json({ success: true, data: { message: 'Logged out' } });
});

module.exports = router;
