/**
 * Role-based access control middleware.
 * Usage: router.post('/', roleGuard('admin'), handler)
 *        router.put('/', roleGuard('admin', 'manager'), handler)
 */
module.exports = function roleGuard(...allowedRoles) {
  return function (req, res, next) {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
    }
    next();
  };
};
