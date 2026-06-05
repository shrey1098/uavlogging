const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');

const logger = require('./config/logger');
const errorHandler = require('./middleware/errorHandler');

// ── Route imports ─────────────────────────────────────────────────────────────
const authRoutes = require('./routes/auth');
const droneRoutes = require('./routes/drones');
const operatorRoutes = require('./routes/operators');
const batteryRoutes = require('./routes/batteries');
const missionRoutes = require('./routes/missions');
const flightLogRoutes = require('./routes/flightLogs');
const readinessRoutes = require('./routes/readiness');

const app = express();

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet());

// ── CORS ──────────────────────────────────────────────────────────────────────
// Each entry in ALLOWED_ORIGINS may be either an exact origin
// (e.g. http://localhost:5173) OR a wildcard pattern using '*' as a
// subdomain match (e.g. https://*.ngrok-free.app). Wildcards are
// compiled to regex once at boot.
const rawOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const exactOrigins = new Set();
const patternOrigins = [];

for (const o of rawOrigins) {
  if (o.includes('*')) {
    // Escape regex specials except '*', then turn '*' into a non-greedy
    // subdomain match. Only allow '*' in the host part, not the scheme.
    const escaped = o
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '[^.]+');
    patternOrigins.push(new RegExp(`^${escaped}$`));
  } else {
    exactOrigins.add(o);
  }
}

const isOriginAllowed = (origin) => {
  if (exactOrigins.has(origin)) return true;
  return patternOrigins.some((re) => re.test(origin));
};

app.use(
  cors({
    origin: (origin, callback) => {
      // No origin header: server-to-server, curl, mobile native — allow.
      if (!origin) return callback(null, true);
      if (isOriginAllowed(origin)) return callback(null, true);
      return callback(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
  })
);

// ── Rate limiting ─────────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again later.', data: null, error: { code: 'rate_limited' } },
});
app.use('/api/', limiter);

// Stricter limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many auth attempts. Try again in 15 minutes.', data: null, error: { code: 'rate_limited' } },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// ── Body parsers ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ── HTTP request logging ──────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(
    morgan('combined', {
      stream: { write: (msg) => logger.http(msg.trim()) },
    })
  );
}

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  // #008 — canonical envelope
  res.json({
    success: true,
    message: 'ok',
    data: {
      status: 'ok',
      environment: process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
    },
  });
});

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/drones', droneRoutes);
app.use('/api/operators', operatorRoutes);
app.use('/api/batteries', batteryRoutes);
app.use('/api/missions', missionRoutes);
app.use('/api/flight-logs', flightLogRoutes);
app.use('/api/readiness', readinessRoutes);

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
  // #008 — canonical envelope
  res.status(404).json({
    success: false,
    message: 'Route not found',
    data: null,
    error: { code: 'not_found' },
  });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;
