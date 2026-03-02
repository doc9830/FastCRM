require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser'); // BUG-003: httpOnly cookies
const cors = require('cors');                  // BUG-008: explicit CORS policy
const path = require('path');
const { initDatabase } = require('./models/init');
const logger = require('./utils/logger');
const requireJson = require('./middleware/requireJson'); // BUG-012

const app = express();
const PORT = process.env.PORT || 3000;

// ── Startup guards ────────────────────────────────────────────────────────
const jwtSecret = process.env.JWT_SECRET;
const adminPassword = process.env.ADMIN_PASSWORD;
const weakSecrets = new Set(['change-me', 'change_this_secret', 'secret', '123456']);

if (!jwtSecret || (process.env.NODE_ENV === 'production' && weakSecrets.has(jwtSecret))) {
  logger.error('JWT_SECRET is missing or too weak for production.');
  process.exit(1);
}
if (!adminPassword || (process.env.NODE_ENV === 'production' && adminPassword.length < 8)) {
  logger.error('ADMIN_PASSWORD is missing or too short for production (min length: 8).');
  process.exit(1);
}

// ── CORS (BUG-008) ────────────────────────────────────────────────────────
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
  : [];

app.use(cors({
  origin: (origin, cb) => {
    // Allow same-origin requests (no Origin header) and explicitly listed origins
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      cb(null, true);
    } else {
      cb(new Error(`CORS: origin ${origin} not allowed`));
    }
  },
  credentials: true, // Required for cookies
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Security & performance middleware ────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: process.env.NODE_ENV === 'production'
        ? ["'self'"]
        : ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
    },
  },
}));

app.use(compression());
app.use(cookieParser()); // BUG-003: parse cookies before auth middleware
app.use(express.json({ limit: '1mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Apply requireJson only to protected API routes (auth routes handle their own validation)

// Request ID
app.use((req, res, next) => {
  req.requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  res.setHeader('X-Request-ID', req.requestId);
  next();
});

// ── Public API routes ────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));

// BUG-016: Health check — no version leak
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});
// ── Protected API routes ─────────────────────────────────────────────────
const authMiddleware = require('./middleware/auth');
const roleGuard = require('./middleware/roleGuard');
const ROLES = require('./constants/roles');

// Apply auth ONLY to protected routes — NOT to /api/auth/* (login, verify, refresh, logout)
app.use('/api/clients',  authMiddleware, requireJson, require('./routes/clients'));
app.use('/api/products', authMiddleware, requireJson, require('./routes/products'));
app.use('/api/orders',   authMiddleware, requireJson, require('./routes/orders'));
app.use('/api/notes',    authMiddleware, requireJson, require('./routes/notes'));
app.use('/api/stats',    authMiddleware, require('./routes/stats'));

// BUG-001: Admin-only routes
app.use('/api/users',    authMiddleware, requireJson, roleGuard(ROLES.ADMIN), require('./routes/users'));
app.use('/api/settings', authMiddleware, requireJson, roleGuard(ROLES.ADMIN), require('./routes/settings'));

// ── Serve built React frontend ────────────────────────────────────────────
const frontendDist = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendDist, { maxAge: '1d' }));

// SPA fallback
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(frontendDist, 'index.html'));
});

// ── Global error handler ─────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  logger.error('Unhandled error', { requestId: req.requestId, err });
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ────────────────────────────────────────────────────────────────
async function startServer() {
  const retries = parseInt(process.env.DB_RETRIES || '5');
  const delay = parseInt(process.env.DB_RETRY_DELAY || '2000');

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await initDatabase();
      break;
    } catch (err) {
      if (attempt === retries) {
        logger.error('Could not connect to database after retries', { retries, err });
        process.exit(1);
      }
      logger.warn('DB not ready, will retry', { attempt, retries, delay });
      await new Promise(r => setTimeout(r, delay));
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    logger.info('FastCRM started', {
      dashboardUrl: `http://localhost:${PORT}`,
      apiUrl: `http://localhost:${PORT}/api`,
      healthUrl: `http://localhost:${PORT}/api/health`,
    });
  });
}

process.on('SIGTERM', () => { logger.info('Shutting down (SIGTERM)'); process.exit(0); });
process.on('SIGINT',  () => { logger.info('Shutting down (SIGINT)');  process.exit(0); });

startServer();
