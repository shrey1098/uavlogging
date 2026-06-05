/**
 * Progress reconciliation service — #003 follow-up
 *
 * Background: the original #003 mechanism attached the progress
 * increment to a Mongoose post-update hook on FlightLog. That works
 * only when the FlightLog status flip is made via Mongoose — but the
 * parser writes via pymongo (raw MongoDB driver), bypassing Mongoose
 * entirely, so the hook never fires for real parsed logs.
 *
 * This reconciler is the backend-owned fix: a short-interval sweep
 * that finds any FlightLog where:
 *   - parseStatus = 'completed'
 *   - parsedData is set (parser wrote it)
 *   - progressAppliedAt is null (not yet counted)
 *
 * For each, it runs the same `applyProgressForLog` logic, then stamps
 * `progressAppliedAt` so the log is never counted twice. The stamp +
 * the progress write are issued separately, but the WHERE clause on
 * the stamp (`progressAppliedAt: null`) makes the update idempotent
 * under concurrency — only one tick can ever transition the marker.
 */

const FlightLog = require('../models/FlightLog');
const ParsedFlightData = require('../models/ParsedFlightData');
const { applyProgressForLog } = require('./progressService');
const logger = require('../config/logger');

const RECONCILE_INTERVAL_MS = parseInt(
  process.env.PROGRESS_RECONCILE_INTERVAL_MS, 10
) || 30_000; // 30s default

// Soft cap on logs processed per tick. Keeps each run bounded so a
// large backlog doesn't block the event loop.
const BATCH_SIZE = parseInt(process.env.PROGRESS_RECONCILE_BATCH, 10) || 50;

let _ticking = false; // prevent overlapping runs if a tick is slow
let _intervalHandle = null;

/**
 * Atomically claim a single FlightLog for reconciliation.
 * Sets progressAppliedAt to now() ONLY if it was null. Returns the
 * pre-update document, or null if another worker already claimed it.
 *
 * Using findOneAndUpdate with the null check makes this safe even if
 * multiple instances of the backend ever run concurrently.
 */
const claimLog = async (logId) =>
  FlightLog.findOneAndUpdate(
    { _id: logId, progressAppliedAt: null },
    { $set: { progressAppliedAt: new Date() } },
    { new: false } // return the pre-update doc so we have the fields
  );

/**
 * Process a single FlightLog: link parsedData if missing, fill Mission
 * stats if applicable, and apply #003 progress.
 *
 * Same logic the parse-complete hook was supposed to perform, just
 * driven by the reconciler instead of a Mongoose hook.
 */
const reconcileOne = async (flightLog) => {
  // Look up the parsed data document the parser wrote.
  const parsed = await ParsedFlightData.findOne({ flightLog: flightLog._id });
  if (!parsed) {
    logger.warn(
      `Reconcile: log ${flightLog._id} has parseStatus=completed but ` +
      `no ParsedFlightData exists — skipping (will retry next tick).`
    );
    // Roll back the claim so we try again next tick.
    await FlightLog.updateOne(
      { _id: flightLog._id },
      { $set: { progressAppliedAt: null } }
    );
    return false;
  }

  // Link parsedData on the FlightLog if not already done. The parser
  // does set this directly via pymongo, but guard for older logs.
  if (!flightLog.parsedData) {
    await FlightLog.updateOne(
      { _id: flightLog._id },
      { $set: { parsedData: parsed._id } }
    );
  }

  // Mission summary fill (the parser also does this via update_mission_stats,
  // but defensively run it here in case any mission row was missed).
  if (flightLog.mission && parsed.summary) {
    const Mission = require('../models/Mission');
    const ms = parsed.summary;
    await Mission.findByIdAndUpdate(flightLog.mission, {
      flightDuration: ms.durationSeconds,
      maxAltitude: ms.maxAltitude,
      maxSpeed: ms.maxGroundSpeed,
      totalDistance: ms.totalDistance,
      actualStart: ms.startTime,
      actualEnd: ms.endTime,
      status: 'pending_verification',
    });
  }

  // The #003 increment. maintenance_test / unclassified are filtered
  // inside applyProgressForLog per the binding rules from #003.
  const flightSeconds = parsed.summary?.durationSeconds || 0;
  await applyProgressForLog(flightLog, flightSeconds);
  logger.info(`#003 progress reconciled for log ${flightLog._id}`);
  return true;
};

/**
 * Run one reconciliation sweep. Idempotent and bounded.
 */
const runReconciliation = async () => {
  if (_ticking) {
    logger.debug('Reconciler: previous tick still running, skipping');
    return;
  }
  _ticking = true;
  try {
    // Find candidates: completed, has parsed data linked OR exists,
    // not yet counted. Limit batch size.
    const candidates = await FlightLog.find({
      parseStatus: 'completed',
      progressAppliedAt: null,
    })
      .sort({ parseCompletedAt: 1 }) // FIFO — oldest unprocessed first
      .limit(BATCH_SIZE)
      .lean();

    if (candidates.length === 0) return;
    logger.info(`Reconciler: ${candidates.length} log(s) pending progress`);

    let processed = 0;
    for (const cand of candidates) {
      // Re-claim atomically — another tick (or restart) shouldn't
      // double-process. claimLog returns the pre-update doc.
      const claimed = await claimLog(cand._id);
      if (!claimed) continue; // someone else got it
      try {
        const ok = await reconcileOne(claimed);
        if (ok) processed++;
      } catch (err) {
        logger.error(
          `Reconciler: error on log ${cand._id}: ${err.message}. ` +
          `Releasing claim for retry.`
        );
        // Release the claim so the next tick retries.
        await FlightLog.updateOne(
          { _id: cand._id },
          { $set: { progressAppliedAt: null } }
        );
      }
    }
    if (processed > 0) {
      logger.info(`Reconciler: applied progress for ${processed} log(s)`);
    }
  } catch (err) {
    logger.error(`Reconciler sweep failed: ${err.message}`);
  } finally {
    _ticking = false;
  }
};

/**
 * Start the reconciler. Runs once immediately for backfill of any
 * historical missed logs (e.g. Dhiraj's), then on a fixed interval.
 */
const startReconciler = () => {
  if (_intervalHandle) {
    logger.warn('Reconciler already running');
    return;
  }
  logger.info(
    `#003 progress reconciler starting (interval=${RECONCILE_INTERVAL_MS}ms, ` +
    `batch=${BATCH_SIZE})`
  );

  // Initial backfill — runs on next tick so it doesn't block startup.
  setImmediate(() => {
    runReconciliation().catch((err) =>
      logger.error(`Initial reconciliation failed: ${err.message}`)
    );
  });

  _intervalHandle = setInterval(() => {
    runReconciliation().catch((err) =>
      logger.error(`Scheduled reconciliation failed: ${err.message}`)
    );
  }, RECONCILE_INTERVAL_MS);
  // Don't keep the event loop alive just for this timer — let
  // graceful shutdown actually shut down.
  if (_intervalHandle.unref) _intervalHandle.unref();
};

const stopReconciler = () => {
  if (_intervalHandle) {
    clearInterval(_intervalHandle);
    _intervalHandle = null;
    logger.info('#003 progress reconciler stopped');
  }
};

module.exports = { startReconciler, stopReconciler, runReconciliation };
