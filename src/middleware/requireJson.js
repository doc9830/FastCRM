/**
 * Enforces Content-Type: application/json for mutating requests that carry a body.
 * Skips check if body is empty (e.g. POST /auth/logout, DELETE requests).
 * BUG-012 fix.
 */
module.exports = function requireJson(req, res, next) {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const hasBody = Number(req.headers['content-length']) > 0 || req.headers['transfer-encoding'];
    if (hasBody && !req.is('application/json')) {
      return res.status(415).json({ error: 'Content-Type must be application/json' });
    }
  }
  next();
};
