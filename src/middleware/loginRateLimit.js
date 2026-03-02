const attemptsByIp = new Map();

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = process.env.NODE_ENV === 'production' ? 10 : 50;

module.exports = function loginRateLimit(req, res, next) {
  const now = Date.now();
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const key = String(ip).split(',')[0].trim();

  const state = attemptsByIp.get(key) || { count: 0, resetAt: now + WINDOW_MS };
  if (now > state.resetAt) {
    state.count = 0;
    state.resetAt = now + WINDOW_MS;
  }

  state.count += 1;
  attemptsByIp.set(key, state);

  const retryAfterSec = Math.ceil((state.resetAt - now) / 1000);
  res.setHeader('Retry-After', String(retryAfterSec));

  if (state.count > MAX_ATTEMPTS) {
    return res.status(429).json({ error: 'Too many login attempts. Please try again later.' });
  }

  return next();
};
