const { verifyAccessToken } = require('../utils/jwt');
const { sendUnauthorized, sendForbidden } = require('../utils/response');
const User = require('../models/User');
const logger = require('../config/logger');

/**
 * protect — verifies JWT, attaches req.user
 */
const protect = async (req, res, next) => {
  try {
    // 1. Extract token from Authorization header or cookie
    let token;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) {
      return sendUnauthorized(res, 'No authentication token provided');
    }

    // 2. Verify token
    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (err) {
      const message =
        err.name === 'TokenExpiredError'
          ? 'Access token has expired'
          : 'Invalid access token';
      return sendUnauthorized(res, message);
    }

    // 3. Check user still exists and is active
    const user = await User.findById(decoded.sub).select('+passwordChangedAt');
    if (!user || !user.isActive) {
      return sendUnauthorized(res, 'User not found or account deactivated');
    }

    // 4. Check password hasn't changed since token was issued
    if (user.changedPasswordAfter(decoded.iat)) {
      return sendUnauthorized(res, 'Password was changed. Please log in again.');
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error('Auth middleware error:', error);
    return sendUnauthorized(res, 'Authentication failed');
  }
};

/**
 * restrictTo — role-based access control
 * Usage: restrictTo('admin', 'operator')
 */
const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return sendForbidden(
        res,
        `Role '${req.user?.role}' is not permitted to perform this action`
      );
    }
    next();
  };
};

/**
 * optionalAuth — attaches user if token present, but doesn't block if absent
 */
const optionalAuth = async (req, _res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = verifyAccessToken(token);
      const user = await User.findById(decoded.sub);
      if (user?.isActive) req.user = user;
    }
  } catch {
    // Silently ignore — optional auth
  }
  next();
};

module.exports = { protect, restrictTo, optionalAuth };
