const logger = require('../config/logger');

const PARSER_URL = process.env.PARSER_SERVICE_URL; // e.g. https://parser.yourapp.com
const PARSER_TIMEOUT_MS = parseInt(process.env.PARSER_TIMEOUT_MS || '120000', 10);

/**
 * Sends a parse job to the Python FastAPI parser service.
 * @param {string} logId       - FlightLog MongoDB _id
 * @param {string} fileUrl     - R2 public/presigned URL to the log file
 * @param {string} logType     - ardupilot_bin | ardupilot_tlog | px4_ulg | csv | kml | skydroid
 */
async function dispatchParseJob(logId, fileUrl, logType) {
  if (!PARSER_URL) {
    throw new Error('PARSER_SERVICE_URL is not set in environment');
  }

  logger.info(`[parserWorker] Dispatching parse job — logId=${logId} type=${logType}`);
  logger.info(`[parserWorker] fileUrl = ${fileUrl}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PARSER_TIMEOUT_MS);

  try {
    const response = await fetch(`${PARSER_URL}/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        log_id:    logId,
        file_url:  fileUrl,
        log_type:  logType,
        mongo_uri: process.env.MONGO_URI,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Parser service returned ${response.status}: ${err}`);
    }

    const result = await response.json();
    logger.info(`[parserWorker] Parse job accepted — logId=${logId}`, result);
    return result;

  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      throw new Error(`Parser service timed out after ${PARSER_TIMEOUT_MS}ms`);
    }
    throw err;
  }
}

module.exports = { dispatchParseJob };
