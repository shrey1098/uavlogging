const User = require('../models/User');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const { sendSuccess, sendCreated, sendError, sendUnauthorized } = require('../utils/response');
const logger = require('../config/logger');

// ── Cookie options ────────────────────────────────────────────────────────────
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
};

const issueTokens = async (user, res) => {
  const accessToken = generateAccessToken(user._id, user.role);
  const refreshToken = generateRefreshToken(user._id);

  // Persist hashed refresh token
  user.refreshToken = refreshToken;
  user.lastLogin = new Date();
  await user.save({ validateBeforeSave: false });

  // Refresh token in httpOnly cookie
  res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);

  return { accessToken, refreshToken };
};

// ── POST /auth/register ───────────────────────────────────────────────────────
exports.register = async (req, res, next) => {
  try {
    const { name, email, password, organisation } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return sendError(res, 'Email is already registered', 409);
    }

    const user = await User.create({ name, email, password, organisation });
    const { accessToken } = await issueTokens(user, res);

    logger.info(`New user registered: ${email}`);

    return sendCreated(res, {
      user: user.toSafeObject(),
      accessToken,
    }, 'Account created successfully');
  } catch (error) {
    next(error);
  }
};

// ── POST /auth/login ──────────────────────────────────────────────────────────
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Include password field (normally excluded)
    const user = await User.findOne({ email }).select('+password');

    if (!user || !(await user.comparePassword(password))) {
      return sendUnauthorized(res, 'Invalid email or password');
    }

    if (!user.isActive) {
      return sendUnauthorized(res, 'Account is deactivated. Contact support.');
    }

    const { accessToken } = await issueTokens(user, res);

    logger.info(`User logged in: ${email}`);

    return sendSuccess(res, {
      user: user.toSafeObject(),
      accessToken,
    }, 'Login successful');
  } catch (error) {
    next(error);
  }
};

// ── POST /auth/refresh ────────────────────────────────────────────────────────
exports.refresh = async (req, res, next) => {
  try {
    const token = req.cookies?.refreshToken || req.body?.refreshToken;

    if (!token) {
      return sendUnauthorized(res, 'No refresh token provided');
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(token);
    } catch {
      return sendUnauthorized(res, 'Invalid or expired refresh token');
    }

    const user = await User.findById(decoded.sub).select('+refreshToken');
    if (!user || user.refreshToken !== token) {
      return sendUnauthorized(res, 'Refresh token mismatch. Please log in again.');
    }

    const { accessToken } = await issueTokens(user, res);

    return sendSuccess(res, { accessToken }, 'Token refreshed');
  } catch (error) {
    next(error);
  }
};

// ── POST /auth/logout ─────────────────────────────────────────────────────────
exports.logout = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (user) {
      user.refreshToken = null;
      await user.save({ validateBeforeSave: false });
    }

    res.clearCookie('refreshToken');
    return sendSuccess(res, null, 'Logged out successfully');
  } catch (error) {
    next(error);
  }
};

// ── GET /auth/me ──────────────────────────────────────────────────────────────
exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return sendUnauthorized(res, 'User not found');
    return sendSuccess(res, { user: user.toSafeObject() });
  } catch (error) {
    next(error);
  }
};

// ── PATCH /auth/me ────────────────────────────────────────────────────────────
exports.updateMe = async (req, res, next) => {
  try {
    const allowedFields = ['name', 'organisation', 'avatarUrl'];
    const updates = {};
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
      runValidators: true,
    });

    return sendSuccess(res, { user: user.toSafeObject() }, 'Profile updated');
  } catch (error) {
    next(error);
  }
};

// ── PATCH /auth/change-password ───────────────────────────────────────────────
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id).select('+password');
    if (!(await user.comparePassword(currentPassword))) {
      return sendError(res, 'Current password is incorrect', 400);
    }

    user.password = newPassword;
    await user.save();

    const { accessToken } = await issueTokens(user, res);

    logger.info(`Password changed for user: ${user.email}`);

    return sendSuccess(res, { accessToken }, 'Password changed successfully');
  } catch (error) {
    next(error);
  }
};
