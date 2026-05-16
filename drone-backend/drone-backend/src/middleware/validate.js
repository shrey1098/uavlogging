const { validationResult } = require('express-validator');
const { sendValidationError } = require('../utils/response');

/**
 * Run after a chain of express-validator checks.
 * Collects errors and returns 422 if any found.
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formatted = errors.array().map((e) => ({
      field: e.path,
      message: e.msg,
      value: e.value,
    }));
    return sendValidationError(res, formatted);
  }
  next();
};

module.exports = validate;
