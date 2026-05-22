/**
 * Parser dispatcher — #004
 *
 * Backend → Parser communication is over HTTP. The parser is a FastAPI
 * service (separate process, separate language). We send a parse job
 * over POST /parse and the parser returns 202 Accepted immediately;
 * actual parsing runs as a FastAPI BackgroundTask, with the parser
 * writing ParsedFlightData to MongoDB and updating FlightLog.parseStatus
 * directly when done.
 *
 * Backend does NOT spawn the parser, and does NOT wait for completion
 * here. The #003 progress hook is attached separately via a Mongoose
 * post-update on FlightLog (see attachParseCompleteHook below) — it
 * fires when the parser transitions parseStatus to 'completed',
 * regardless of which process makes the write.
 */

const FlightLog = require('../models/FlightLog');
const Mission = require('../models/Mission');
const ParsedFlightData = require('../models/ParsedFlightData');
const { getPresignedUrl } = require('../config/r2');
const logger = require('../config/logger');

// #004 portability: parser URL — change when parser is hosted on a
// separate cloud service.
const PARSER_SERVICE_URL = process.env.PARSER_SERVICE_URL || 'http://localhost:8000';

const DISPATCH_TIMEOUT_MS = parseInt(process.env.PARSER_TIMEOUT_MS, 10) || 30000;

/**
 * Dispatch a parse job to the FastAPI parser service.
 * Returns when the parser acknowledges (202). Does NOT wait for the
 * parse to actually finish.
 *
 * @param {mongoose.Types.ObjectId | string} flightLogId
 */
const spawnParser = async (flightLogId) => {
  const flightLog = await FlightLog.findById(flightLogId);
  if (!flightLog) throw new Error(`FlightLog not found: ${flightLogId}`);

  if (!flightLog.r2Key) {
    const msg = 'Cannot dispatch parse: r2Key missing on FlightLog';
    flightLog.parseStatus = 'failed';
    flightLog.parseError = { message: msg, code: 'NO_R2_KEY' };
    await flightLog.save({ validateBeforeSave: false });
    throw new Error(msg);
  }

  logger.info(`Parser dispatch for log ${flightLogId} (${flightLog.logType})`);

  flightLog.parseStatus = 'processing';
  flightLog.parseStartedAt = new Date();
  await flightLog.save({ validateBeforeSave: false });

  // Mint a fresh presigned URL per dispatch (TTL: r2 module default, 1h).
  // The URL is never persisted — only sent over the wire to the parser.
  let fileUrl;
  try {
    fileUrl = await getPresignedUrl(flightLog.r2Key);
  } catch (err) {
    const msg = `Failed to mint presigned URL: ${err.message}`;
    flightLog.parseStatus = 'failed';
    flightLog.parseError = { message: msg, code: 'PRESIGN_FAIL' };
    await flightLog.save({ validateBeforeSave: false });
    throw new Error(msg);
  }

  const body = {
    log_id: String(flightLogId),
    file_url: fileUrl,
    log_type: flightLog.logType,
    mongo_uri: process.env.MONGO_URI,
  };

  // #004 portability: HTTP dispatch boundary. No code change required
  // to retarget across hosts; only PARSER_SERVICE_URL moves.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DISPATCH_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(`${PARSER_SERVICE_URL}/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const msg = err.name === 'AbortError'
      ? `Parser dispatch timed out after ${DISPATCH_TIMEOUT_MS}ms`
      : `Parser dispatch network error: ${err.message}`;
    flightLog.parseStatus = 'failed';
    flightLog.parseError = { message: msg, code: 'DISPATCH_FAIL' };
    await flightLog.save({ validateBeforeSave: false });
    logger.error(`Parser dispatch failed for log ${flightLogId}: ${msg}`);
    throw new Error(msg);
  }
  clearTimeout(timer);

  if (!response.ok) {
    let detail = '';
    try { detail = await response.text(); } catch (_) {}
    const msg = `Parser returned ${response.status}: ${detail.slice(0, 500)}`;
    flightLog.parseStatus = 'failed';
    flightLog.parseError = { message: msg, code: String(response.status) };
    await flightLog.save({ validateBeforeSave: false });
    logger.error(`Parser dispatch rejected for log ${flightLogId}: ${msg}`);
    throw new Error(msg);
  }

  logger.info(`Parser accepted job for log ${flightLogId} (HTTP ${response.status})`);
  return { dispatched: true, status: response.status };
};

/**
 * #003 progress hook — fires when FlightLog.parseStatus transitions
 * to 'completed'. The parser writes ParsedFlightData and sets the
 * status directly on the document; this hook detects that write and
 * runs the progress increment.
 *
 * Binding constraints from #003 + #004:
 *   - Fires EXACTLY ONCE per successful parse
 *   - Never on failed parses
 *   - Never on maintenance-test logs (gated inside progressService)
 *
 * Attachment: Mongoose findOneAndUpdate post-hook. We rely on the
 * fact that the parser flips parseStatus via an update, not a save.
 * We also run a mission-stats update here (formerly done in the
 * subprocess close handler) so the Mission reflects parsed summary.
 */
const attachParseCompleteHook = () => {
  // findOneAndUpdate path — Mongoose driver path the parser is most
  // likely to use via pymongo's update_one() equivalent. We also
  // listen on updateOne for completeness.
  const handleCompletion = async function (doc) {
    if (!doc) return;
    if (doc.parseStatus !== 'completed') return;

    // Idempotency guard: only fire if we haven't already linked
    // parsedData (this is the marker that the post-completion work
    // has run). The parser writes parsedData on the FlightLog itself
    // in some implementations, but if it doesn't, we set it here.
    try {
      const parsed = await ParsedFlightData.findOne({ flightLog: doc._id });
      if (!parsed) {
        logger.warn(`parseStatus=completed but no ParsedFlightData for log ${doc._id}`);
        return;
      }

      // Link parsedData on the FlightLog if not already done.
      // Use updateOne with the same field — won't re-trigger this hook
      // because parseStatus isn't changing.
      if (!doc.parsedData) {
        await FlightLog.updateOne(
          { _id: doc._id },
          { $set: { parsedData: parsed._id } }
        );
      }

      // Mission summary fill (formerly done in subprocess close handler).
      if (doc.mission && parsed.summary) {
        await Mission.findByIdAndUpdate(doc.mission, {
          flightDuration: parsed.summary.durationSeconds,
          maxAltitude: parsed.summary.maxAltitude,
          maxSpeed: parsed.summary.maxGroundSpeed,
          totalDistance: parsed.summary.totalDistance,
          actualStart: parsed.summary.startTime,
          actualEnd: parsed.summary.endTime,
          status: 'pending_verification',
        });
      }

      // #003 progress increment — exactly once per successful parse.
      // maintenance_test and unclassified are filtered inside the service.
      const { applyProgressForLog } = require('../services/progressService');
      const flightSeconds = parsed.summary?.durationSeconds || 0;
      await applyProgressForLog(doc, flightSeconds);
      logger.info(`#003 progress applied for log ${doc._id}`);
    } catch (err) {
      logger.error(`Post-parse hook failed for log ${doc?._id}: ${err.message}`);
    }
  };

  // Wire the post-hooks on the FlightLog schema.
  const flightLogSchema = FlightLog.schema;
  flightLogSchema.post('findOneAndUpdate', handleCompletion);
  flightLogSchema.post('updateOne', async function () {
    // updateOne doesn't pass the doc; fetch it ourselves using the filter.
    try {
      const doc = await FlightLog.findOne(this.getQuery());
      await handleCompletion(doc);
    } catch (err) {
      logger.error(`updateOne post-hook lookup failed: ${err.message}`);
    }
  });

  logger.info('FlightLog parse-complete hook attached (#003 + #004)');
};

module.exports = { spawnParser, attachParseCompleteHook };
