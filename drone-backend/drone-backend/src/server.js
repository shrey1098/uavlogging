require('dotenv').config();
const http = require('http');
const app = require('./app');
const connectDB = require('./config/database');
const logger = require('./config/logger');

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();

    // #003 + #004 — attach the FlightLog post-update hook that fires
    // the gamification progress increment on parseStatus -> completed.
    // Must run AFTER mongoose connects; before the HTTP server starts.
    //
    // NOTE: The hook only fires when the write goes through Mongoose
    // (e.g. backend reparse, manual ops). The parser writes via pymongo
    // and bypasses Mongoose, so the reconciler below handles that case.
    const { attachParseCompleteHook } = require('./workers/parserWorker');
    attachParseCompleteHook();

    // #003 reconciliation pass — sweeps for completed FlightLogs that
    // never got their progress applied (the parser's pymongo writes
    // bypass Mongoose hooks). Idempotent via FlightLog.progressAppliedAt.
    // Initial run on startup also backfills any historical misses.
    const { startReconciler } = require('./services/progressReconciler');
    startReconciler();

    const server = http.createServer(app);

    const HOST = process.env.HOST || '0.0.0.0';
    server.listen(PORT, HOST, () => {
      logger.info(`🚁 Drone Debrief API running on ${HOST}:${PORT} [${process.env.NODE_ENV}]`);
    });

    // ── Graceful shutdown ─────────────────────────────────────────────────────
    const shutdown = (signal) => {
      logger.info(`${signal} received. Shutting down gracefully...`);
      try {
        const { stopReconciler } = require('./services/progressReconciler');
        stopReconciler();
      } catch (_) {}
      server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });
      // Force exit after 10s
      setTimeout(() => {
        logger.error('Force exit after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled Rejection:', reason);
    });

  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
};

startServer();
