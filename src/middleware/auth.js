const jwt = require('jsonwebtoken');

/**
 * Auth middleware.
 * Reads JWT from httpOnly cookie (preferred) or Authorization header (fallback).
 */
module.exports = function authMiddleware(req, res, next) {
  // Prefer cookie (httpOnly, not accessible to JS — BUG-003 fix)
  const token =
    req.cookies?.token ||
    req.headers.authorization?.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};
