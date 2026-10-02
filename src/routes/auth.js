const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { Resend } = require('resend');
const env = require('../config/env');
const { pool } = require('../db/pool');
const { authenticateJWT } = require('../middleware/auth');

const router = express.Router();

// Initialize Resend email service
const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

// Generate OTP code
function generateOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

// Send OTP via email
async function sendOTPEmail(email, otpCode) {
  if (!resend) {
    // Fallback to console logging if no Resend API key configured
    console.log(`\n📧 OTP for ${email}: ${otpCode}`);
    console.log('This code expires in 10 minutes\n');
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

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Find user by email only (no role needed)
    const [users] = await pool.query(
      `SELECT u.id, u.email, u.password_hash, u.full_name, u.role, u.branch,
              u.hub_id, h.name AS hub_name, h.region AS hub_region
       FROM users u
       LEFT JOIN hubs h ON u.hub_id = h.id
       WHERE u.email = ? LIMIT 1`,
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = users[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate OTP code
    const otpCode = generateOTP();
    
    // Store OTP in database
    await pool.query(
      `UPDATE users SET otp_code = ?, otp_expires = DATE_ADD(NOW(), INTERVAL 10 MINUTE) WHERE id = ?`,
      [otpCode, user.id]
    );

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

router.get('/me', authenticateJWT, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.email, u.full_name AS name, u.role, u.branch,
              u.hub_id AS hubId, h.name AS hubName, h.region AS hubRegion,
              u.created_at AS createdAt, u.last_login_at AS lastLoginAt
       FROM users u
       LEFT JOIN hubs h ON u.hub_id = h.id
       WHERE u.id = ? LIMIT 1`,
      [req.user.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('Get user error:', err);
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

    // Get user and verify OTP
    const [rows] = await pool.query(
      `SELECT id, otp_code, otp_expires FROM users WHERE id = ?`,
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = rows[0];
    const now = new Date().toISOString();
    const isValidOTP = 
      user.otp_code && 
      user.otp_expires && 
      otp === user.otp_code && 
      now < user.otp_expires;

    if (!isValidOTP) {
      return res.status(401).json({ error: 'Invalid or expired verification code' });
    }

    // Clear OTP after successful verification
    await pool.query(
      `UPDATE users SET otp_code = NULL, otp_expires = NULL WHERE id = ?`,
      [userId]
    );

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
    console.error('Verify OTP error:', err);
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

    // Get user email
    const [rows] = await pool.query(
      `SELECT email FROM users WHERE id = ?`,
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Generate new OTP
    const otpCode = generateOTP();
    
    // Store new OTP in database
    await pool.query(
      `UPDATE users SET otp_code = ?, otp_expires = DATE_ADD(NOW(), INTERVAL 10 MINUTE) WHERE id = ?`,
      [otpCode, userId]
    );

    // Send new OTP via email
    const email = rows[0].email;
    await sendOTPEmail(email, otpCode);

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

module.exports = router;
