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

// The one verified email address that Resend allows in test/free mode
const VERIFIED_EMAIL = 'twagirimanaephron1@gmail.com';

// Send OTP via email.
// If Resend rejects the recipient (unverified domain), falls back to VERIFIED_EMAIL.
async function sendOTPEmail(userEmail, otpCode) {
  if (!resend) {
    throw new Error('Email service not configured. Please contact the administrator.');
  }

  const isVerifiedRecipient = userEmail === VERIFIED_EMAIL;

  // Build email — if fallback, note in subject/body who it's really for
  const to = isVerifiedRecipient ? userEmail : VERIFIED_EMAIL;
  const subject = isVerifiedRecipient
    ? 'Your Login Verification Code'
    : `OTP for ${userEmail} — Voltage-Drop`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #f97316;">Voltage-Drop Login Verification</h2>
      ${!isVerifiedRecipient ? `<p style="background:#fff3cd;padding:10px;border-radius:6px;color:#856404;">⚠️ OTP requested by <strong>${userEmail}</strong> — sent here because domain is not yet verified on Resend.</p>` : ''}
      <p style="color: #666; font-size: 16px;">Your one-time verification code is:</p>
      <div style="background-color: #f5f5f5; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
        <span style="font-size: 32px; font-weight: bold; color: #333; letter-spacing: 8px;">${otpCode}</span>
      </div>
      <p style="color: #666; font-size: 14px;">This code will expire in 10 minutes.</p>
      <p style="color: #999; font-size: 12px; margin-top: 20px;">If you didn't request this code, please ignore this email.</p>
    </div>
  `;

  const { data, error } = await resend.emails.send({
    from: env.EMAIL_FROM || 'Voltage-Drop <onboarding@resend.dev>',
    to: [to],
    subject,
    html,
  });

  if (error) {
    console.error(`[EMAIL] Failed to send to ${to}:`, error);
    throw new Error(error.message || 'Failed to send verification email');
  }

  console.log(`[EMAIL] Sent to ${to} (requested by ${userEmail}). Message ID: ${data.id}`);
}

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user by email
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

    // Generate OTP and store with MySQL NOW() to avoid timezone issues
    const otpCode = generateOTP();
    await pool.query(
      `UPDATE users SET otp_code = ?, otp_expires = DATE_ADD(NOW(), INTERVAL 10 MINUTE) WHERE id = ?`,
      [otpCode, user.id]
    );

    // Send OTP — if email fails, return a clear error (don't silently drop)
    try {
      await sendOTPEmail(user.email, otpCode);
    } catch (emailErr) {
      console.error('[LOGIN] Email delivery failed:', emailErr.message);
      return res.status(503).json({
        error: 'Could not send verification email. Please contact support or try again later.',
      });
    }

    // Temp token valid for 15 minutes (buffer for email delay)
    const tempToken = jwt.sign(
      { id: user.id, role: user.role, name: user.full_name, hubId: user.hub_id || null },
      env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    return res.json({
      success: true,
      data: {
        token: tempToken,
        message: 'Please check your email for the verification code',
        expiresIn: '15m',
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    next(err);
  }
});

// GET /api/auth/me
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

// POST /api/auth/logout
router.post('/logout', authenticateJWT, (_req, res) => {
  return res.json({ success: true, data: { message: 'Logged out' } });
});

// POST /api/auth/verify-otp
router.post('/verify-otp', async (req, res, next) => {
  try {
    const { otp, token } = req.body;

    if (!token) {
      return res.status(401).json({ error: 'Missing authorization token' });
    }
    if (!otp) {
      return res.status(400).json({ error: 'OTP code is required' });
    }

    // Verify temp token
    let decoded;
    try {
      decoded = jwt.verify(token, env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token. Please login again.' });
    }

    const userId = decoded.id;

    // Fetch user + validate OTP entirely in MySQL using NOW() to avoid JS timezone issues
    const [rows] = await pool.query(
      `SELECT id, email, full_name, role, branch, hub_id,
              otp_code,
              otp_expires,
              (otp_code IS NOT NULL AND otp_expires IS NOT NULL AND NOW() <= otp_expires) AS otp_still_valid
       FROM users WHERE id = ?`,
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = rows[0];

    console.log(`[OTP] user=${user.email} stored=${user.otp_code} received=${otp} valid=${user.otp_still_valid}`);

    // otp_still_valid is 1/0 from MySQL, coerce to boolean
    if (!user.otp_still_valid || String(otp).trim() !== String(user.otp_code).trim()) {
      return res.status(401).json({ error: 'Invalid or expired verification code' });
    }

    // Clear OTP and update last login
    await pool.query(
      `UPDATE users SET otp_code = NULL, otp_expires = NULL, last_login_at = NOW() WHERE id = ?`,
      [user.id]
    );

    // Issue final JWT
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

// POST /api/auth/resend-otp
router.post('/resend-otp', async (req, res, next) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(401).json({ error: 'Missing authorization token' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token. Please login again.' });
    }

    const userId = decoded.id;

    const [rows] = await pool.query(`SELECT email FROM users WHERE id = ?`, [userId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const otpCode = generateOTP();
    await pool.query(
      `UPDATE users SET otp_code = ?, otp_expires = DATE_ADD(NOW(), INTERVAL 10 MINUTE) WHERE id = ?`,
      [otpCode, userId]
    );

    try {
      await sendOTPEmail(rows[0].email, otpCode);
    } catch (emailErr) {
      console.error('[RESEND-OTP] Email delivery failed:', emailErr.message);
      return res.status(503).json({
        error: 'Could not send verification email. Please contact support or try again later.',
      });
    }

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
