const logger = require('../config/logger');

const errorHandler = (err, req, res, _next) => {
  // Log the error
  logger.error({
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
  });

  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'Internal server error';
  let errors = null;

  // ── Mongoose Validation Error ─────────────────────────────────────────────
  if (err.name === 'ValidationError') {
    statusCode = 422;
    message = 'Validation failed';
    errors = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
  }

  // ── Mongoose CastError (bad ObjectId) ────────────────────────────────────
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid ${err.path}: "${err.value}"`;
  }

  // ── MongoDB Duplicate Key ─────────────────────────────────────────────────
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0];
    message = `Duplicate value for field: ${field}`;
  }

  // ── JWT errors (shouldn't reach here but belt-and-braces) ────────────────
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  }
  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  }

  // ── Multer errors ─────────────────────────────────────────────────────────
  if (err.code === 'LIMIT_FILE_SIZE') {
    statusCode = 413;
    message = `File too large. Maximum size is ${process.env.MAX_FILE_SIZE_MB || 500}MB`;
  }

  // #008 — canonical envelope: data always present, error carries code+details
  const body = {
    success: false,
    message,
    data: null,
    ...(errors && { error: { code: 'validation', details: errors } }),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  };

  res.status(statusCode).json(body);
};

module.exports = errorHandler;
