/**
 * wipe-flight-data.js — DESTRUCTIVE
 *
 * Full reset of all flight-derived data:
 *   - FlightLog            (all docs)
 *   - ParsedFlightData     (all docs)
 *   - OperatorProgress     (all docs — scoreboards reset to zero)
 *   - Mission flight stats (cleared back to pre-flight state; mission
 *                           docs themselves are kept, only the parsed
 *                           summary fields are nulled and status reset)
 *   - R2 objects           (every stored flight log file deleted)
 *
 * Leaves untouched: User, Operator, Drone, Battery.
 *
 * Usage:
 *   node src/utils/wipe-flight-data.js            # asks for confirmation
 *   node src/utils/wipe-flight-data.js --yes      # skips the prompt
 */

require('dotenv').config();
const readline = require('readline');
const mongoose = require('mongoose');

const connectDB = require('../config/database');
const logger = require('../config/logger');

const FlightLog = require('../models/FlightLog');
const ParsedFlightData = require('../models/ParsedFlightData');
const { OperatorProgress } = require('../models/OperatorProgress');
const Mission = require('../models/Mission');

const { deleteObject } = require('../config/r2');

const confirm = (question) =>
  new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });

const wipe = async () => {
  await connectDB();

  // ── Pre-flight counts so the operator knows what they're about to nuke ─
  const [logCount, parsedCount, progressCount, missionCount] = await Promise.all([
    FlightLog.countDocuments({}),
    ParsedFlightData.countDocuments({}),
    OperatorProgress.countDocuments({}),
    Mission.countDocuments({}),
  ]);

  logger.info('═══════════════════════════════════════════════');
  logger.info('  FLIGHT DATA WIPE — about to delete:');
  logger.info(`    FlightLogs:        ${logCount}`);
  logger.info(`    ParsedFlightData:  ${parsedCount}`);
  logger.info(`    OperatorProgress:  ${progressCount} (scoreboards reset)`);
  logger.info(`    Missions affected: ${missionCount} (stats cleared, docs kept)`);
  logger.info(`    R2 objects:        ${logCount} files (best-effort delete)`);
  logger.info('  KEPT: Users, Operators, Drones, Batteries');
  logger.info('═══════════════════════════════════════════════');

  const skipPrompt = process.argv.includes('--yes');
  if (!skipPrompt) {
    const answer = await confirm('Type "WIPE" to confirm this irreversible action: ');
    if (answer !== 'wipe') {
      logger.info('Aborted. Nothing was deleted.');
      await mongoose.disconnect();
      process.exit(0);
    }
  }

  // ── 1. Delete R2 objects first (need r2Key from FlightLogs) ───────────
  logger.info('🗑  Deleting R2 objects...');
  const logsWithKeys = await FlightLog.find({ r2Key: { $ne: null } }).select('r2Key').lean();
  let r2Deleted = 0;
  let r2Failed = 0;
  for (const log of logsWithKeys) {
    try {
      await deleteObject(log.r2Key);
      r2Deleted++;
    } catch (err) {
      r2Failed++;
      logger.warn(`R2 delete failed for ${log.r2Key}: ${err.message}`);
    }
  }
  logger.info(`   R2: ${r2Deleted} deleted, ${r2Failed} failed/already-gone`);

  // ── 2. Wipe the collections ───────────────────────────────────────────
  logger.info('🧹 Wiping collections...');
  const [logRes, parsedRes, progressRes] = await Promise.all([
    FlightLog.deleteMany({}),
    ParsedFlightData.deleteMany({}),
    OperatorProgress.deleteMany({}),
  ]);
  logger.info(`   FlightLog:        ${logRes.deletedCount} deleted`);
  logger.info(`   ParsedFlightData: ${parsedRes.deletedCount} deleted`);
  logger.info(`   OperatorProgress: ${progressRes.deletedCount} deleted`);

  // ── 3. Clear flight stats off Missions (keep the mission docs) ────────
  // Unsets the parsed-summary fields and resets status to 'draft' so the
  // mission is back to its pre-flight state but still exists.
  const missionRes = await Mission.updateMany(
    {},
    {
      $unset: {
        flightDuration: '',
        maxAltitude: '',
        maxSpeed: '',
        totalDistance: '',
        actualStart: '',
        actualEnd: '',
        maxWindSpeed: '',
        flightLog: '',
      },
      $set: { status: 'draft' },
    }
  );
  logger.info(`   Missions cleared: ${missionRes.modifiedCount} reset to draft`);

  logger.info('═══════════════════════════════════════════════');
  logger.info('✅ WIPE COMPLETE — flight data cleared, fleet/users intact');
  logger.info('═══════════════════════════════════════════════');

  await mongoose.disconnect();
  process.exit(0);
};

wipe().catch((err) => {
  logger.error('Wipe failed:', err);
  process.exit(1);
});