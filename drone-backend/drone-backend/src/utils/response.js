/**
 * Standardised API response helpers — #008
 *
 * Canonical envelope for ALL routes:
 *   {
 *     success: <boolean>,
 *     data:    <payload | null>,        // payload always lives here
 *     message: <string>,                // human-readable status; NEVER a payload container
 *     meta:    <optional object>,       // pagination, totals, etc.
 *     error:   <optional { code, details }>  // on failures only
 *   }
 *
 * Binding rule (#008): never put payloads under `message`. `message` is
 * a string-only status line.
 */

const sendSuccess = (res, data = null, message = 'Success', statusCode = 200, meta = null) => {
  const body = { success: true, message, data };
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
};

const sendCreated = (res, data, message = 'Created successfully') =>
  sendSuccess(res, data, message, 201);

/**
 * Send an error response. `errorPayload` may be:
 *   - null/undefined           → no error field on the response
 *   - { code, details }        → set as `error` per #008
 *   - an array (validation)    → set as `error.details` with code 'validation'
 *   - any other object         → set as `error.details` with code 'error'
 */
const sendError = (res, message = 'Something went wrong', statusCode = 500, errorPayload = null) => {
  const body = { success: false, message, data: null };

  if (errorPayload) {
    if (Array.isArray(errorPayload)) {
      body.error = { code: 'validation', details: errorPayload };
    } else if (typeof errorPayload === 'object' && errorPayload.code) {
      body.error = errorPayload;
    } else {
      body.error = { code: 'error', details: errorPayload };
    }
  }

  return res.status(statusCode).json(body);
};

const sendNotFound = (res, resource = 'Resource') =>
  sendError(res, `${resource} not found`, 404, { code: 'not_found' });

const sendUnauthorized = (res, message = 'Unauthorized') =>
  sendError(res, message, 401, { code: 'unauthorized' });

const sendForbidden = (res, message = 'Forbidden') =>
  sendError(res, message, 403, { code: 'forbidden' });

const sendValidationError = (res, errors) =>
  sendError(res, 'Validation failed', 422, errors);

module.exports = {
  sendSuccess,
  sendCreated,
  sendError,
  sendNotFound,
  sendUnauthorized,
  sendForbidden,
  sendValidationError,
};
