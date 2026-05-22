/**
 * Progress increment service — DECISIONS #003
 *
 * Applies the counter rules when a flight log becomes counted.
 *
 * Rules (binding, from #003):
 *  - A counted sortie: +1 to matching Time counter AND +1 to matching
 *    Type counter, independently.
 *  - typeClass 'maintenance_test' increments NOTHING — not Type, not
 *    Time, not currency, not Volume/Experience inputs.
 *  - realOpsCount increments ONLY on the commander Real-Ops upload path
 *    (isRealOps === true), never operator-self.
 *  - Volume/Experience inputs (countedSorties, countedFlightSeconds)
 *    exclude maintenance_test.
 */

const { OperatorProgress } = require('../models/OperatorProgress');
const logger = require('../config/logger');

/**
 * Apply progress for a single flight log.
 * Idempotency note: callers must ensure this runs ONCE per log
 * (call on parse-complete transition, not on every status write).
 *
 * @param {Object} flightLog  — FlightLog document (owner, timeClass,
 *                               typeClass, isRealOps) + parsed duration
 * @param {Number} flightSeconds — counted flight duration in seconds
 */
const applyProgressForLog = async (flightLog, flightSeconds = 0) => {
  const { owner, timeClass, typeClass, isRealOps } = flightLog;

  if (!owner) {
    logger.warn(`applyProgressForLog: log ${flightLog._id} has no owner; skipped`);
    return null;
  }

  const isMaintenance = typeClass === 'maintenance_test';

  // Build atomic update
  const inc = {};
  const set = {};

  if (!isMaintenance) {
    // Time counter
    if (timeClass === 'day' || timeClass === 'night') {
      inc[`timeCounts.${timeClass}`] = 1;
    }
    // Type counter (maintenance_test already excluded above)
    if (['surveillance', 'drop', 'obstacle', 'navigation', 'fpv'].includes(typeClass)) {
      inc[`typeCounts.${typeClass}`] = 1;
    }
    // Volume / Experience inputs
    inc.countedSorties = 1;
    inc.countedFlightSeconds = Math.max(0, Math.round(flightSeconds || 0));
    // Currency anchor — most recent counted flight
    set.lastFlightAt = new Date();
  }

  // Real Ops counter — commander-gated, independent of maintenance rule.
  // (A real op is never a maintenance_test by workflow, but guard anyway.)
  if (isRealOps === true && !isMaintenance) {
    inc.realOpsCount = 1;
  }

  if (Object.keys(inc).length === 0 && Object.keys(set).length === 0) {
    // maintenance_test with nothing to do — honest no-op
    logger.info(`Progress: log ${flightLog._id} is maintenance_test/no-op; nothing incremented`);
    return null;
  }

  const update = {};
  if (Object.keys(inc).length) update.$inc = inc;
  if (Object.keys(set).length) update.$set = set;

  const progress = await OperatorProgress.findOneAndUpdate(
    { owner },
    update,
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  logger.info(`Progress updated for operator ${owner} (log ${flightLog._id})`);
  return progress;
};

module.exports = { applyProgressForLog };
