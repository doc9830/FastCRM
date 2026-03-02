const router = require('express').Router();
const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const loginRateLimit = require('../middleware/loginRateLimit');

const IS_PROD = process.env.NODE_ENV === 'production';

// Cookie options — BUG-003 fix
const COOKIE_OPTS = {
  httpOnly: true,                    // Not accessible to JavaScript
  secure: IS_PROD,                   // HTTPS only in production
  sameSite: IS_PROD ? 'Strict' : 'Lax',
  path: '/',
};

// BUG-013: short-lived access token + longer refresh token
const ACCESS_TTL  = '1h';
const REFRESH_TTL = '7d';
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function signAccess(user) {
  return jwt.sign(
    { id: user.id, username: user.username, name: user.name, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TTL }
  );
}

function signRefresh(user) {
  return jwt.sign(
    { id: user.id, sub: 'refresh' },
    process.env.JWT_SECRET,
    { expiresIn: REFRESH_TTL }
  );
}

// POST /api/auth/login
router.post('/login', loginRateLimit, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Username and password required' });

    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1', [username]
    );
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const accessToken  = signAccess(user);
    const refreshToken = signRefresh(user);

    // BUG-003: set tokens in httpOnly cookies (not exposed to JS)
    res.cookie('token',         accessToken,  { ...COOKIE_OPTS, maxAge: 60 * 60 * 1000 });
    res.cookie('refresh_token', refreshToken, { ...COOKIE_OPTS, maxAge: REFRESH_TTL_MS });

    const safeUser = { id: user.id, username: user.username, name: user.name, role: user.role };
    logger.info('User logged in', { userId: user.id, username: user.username });
    res.json({ user: safeUser });
  } catch (err) {
    logger.error('Auth login error', { err });
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/refresh — BUG-013: exchange refresh token for new access token
router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = req.cookies?.refresh_token;
    if (!refreshToken) return res.status(401).json({ error: 'No refresh token' });

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    if (decoded.sub !== 'refresh') return res.status(401).json({ error: 'Invalid token type' });

    const result = await pool.query(
      'SELECT id, username, name, role FROM users WHERE id = $1', [decoded.id]
    );
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'User not found' });

    const newAccessToken = signAccess(user);
    res.cookie('token', newAccessToken, { ...COOKIE_OPTS, maxAge: 60 * 60 * 1000 });
    res.json({ user });
  } catch (err) {
    logger.error('Auth refresh error', { err });
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/logout — clear cookies
router.post('/logout', (req, res) => {
  res.clearCookie('token',         { ...COOKIE_OPTS });
  res.clearCookie('refresh_token', { ...COOKIE_OPTS });
  res.json({ message: 'Logged out' });
});

// GET /api/auth/verify
router.get('/verify', async (req, res) => {
  try {
    const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const result = await pool.query(
      'SELECT id, username, name, role FROM users WHERE id = $1', [decoded.id]
    );
    if (!result.rows[0]) return res.status(401).json({ error: 'User not found' });
    res.json({ user: result.rows[0] });
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

module.exports = router;
