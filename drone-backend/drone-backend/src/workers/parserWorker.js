const { spawn } = require('child_process');
const path = require('path');
const FlightLog = require('../models/FlightLog');
const ParsedFlightData = require('../models/ParsedFlightData');
const Mission = require('../models/Mission');
const logger = require('../config/logger');

const PYTHON_PATH = process.env.PYTHON_PATH || 'python3';
const PARSER_SCRIPT = path.resolve(process.env.PARSER_WORKER_PATH || '../parser-worker/main.py');
const TIMEOUT_MS = parseInt(process.env.PARSER_TIMEOUT_MS, 10) || 120000;

/**
 * Spawns the Python parser for a given FlightLog document ID.
 * Updates FlightLog.parseStatus throughout the process.
 * Writes ParsedFlightData to DB on success.
 *
 * @param {mongoose.Types.ObjectId | string} flightLogId
 */
const spawnParser = async (flightLogId) => {
  const flightLog = await FlightLog.findById(flightLogId);
  if (!flightLog) throw new Error(`FlightLog not found: ${flightLogId}`);

  logger.info(`Parser starting for log ${flightLogId} (${flightLog.logType})`);

  flightLog.parseStatus = 'processing';
  flightLog.parseStartedAt = new Date();
  await flightLog.save({ validateBeforeSave: false });

  return new Promise((resolve, reject) => {
    const args = [
      PARSER_SCRIPT,
      '--log-id', String(flightLogId),
      '--file', flightLog.filePath,
      '--type', flightLog.logType,
      '--mongo-uri', process.env.MONGO_URI,
    ];

    const child = spawn(PYTHON_PATH, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      logger.error(`Parser timed out for log ${flightLogId}`);
    }, TIMEOUT_MS);

    child.on('close', async (code) => {
      clearTimeout(timer);

      try {
        flightLog.parseCompletedAt = new Date();

        if (code !== 0) {
          flightLog.parseStatus = 'failed';
          flightLog.parseError = {
            message: `Parser exited with code ${code}`,
            stack: stderr.slice(0, 2000),
            code: String(code),
          };
          await flightLog.save({ validateBeforeSave: false });
          logger.error(`Parser failed for log ${flightLogId}: ${stderr}`);
          return reject(new Error(`Parser exited ${code}`));
        }

        // Parser writes ParsedFlightData directly to MongoDB.
        // We just update our status reference here.
        let parsedData = await ParsedFlightData.findOne({ flightLog: flightLogId });

        if (parsedData) {
          flightLog.parsedData = parsedData._id;
          flightLog.parseStatus = 'completed';

          // Update mission with flight summary from parsed data
          if (flightLog.mission && parsedData.summary) {
            await Mission.findByIdAndUpdate(flightLog.mission, {
              flightDuration: parsedData.summary.durationSeconds,
              maxAltitude: parsedData.summary.maxAltitude,
              maxSpeed: parsedData.summary.maxGroundSpeed,
              totalDistance: parsedData.summary.totalDistance,
              actualStart: parsedData.summary.startTime,
              actualEnd: parsedData.summary.endTime,
              status: 'pending_verification',
            });
          }

          await flightLog.save({ validateBeforeSave: false });
          logger.info(`Parser completed for log ${flightLogId}`);

          // #003 — apply gamification progress ONCE on parse-complete.
          // maintenance_test / unclassified handled inside the service.
          try {
            const { applyProgressForLog } = require('../services/progressService');
            const flightSeconds = parsedData.summary?.durationSeconds || 0;
            await applyProgressForLog(flightLog, flightSeconds);
          } catch (progErr) {
            logger.error(`#003 progress increment failed for log ${flightLogId}: ${progErr.message}`);
            // Non-fatal: parse succeeded; progress can be backfilled.
          }

          resolve(parsedData);
        } else {
          // Parser reported success but no data found — mark as failed
          flightLog.parseStatus = 'failed';
          flightLog.parseError = { message: 'Parser exited OK but no data written to DB', code: '0' };
          await flightLog.save({ validateBeforeSave: false });
          reject(new Error('No parsed data found after parser completed'));
        }

      } catch (dbErr) {
        logger.error(`DB update failed after parse for log ${flightLogId}: ${dbErr.message}`);
        reject(dbErr);
      }
    });

    child.on('error', async (err) => {
      clearTimeout(timer);
      flightLog.parseStatus = 'failed';
      flightLog.parseError = { message: err.message, code: 'SPAWN_ERROR' };
      await flightLog.save({ validateBeforeSave: false }).catch(() => {});
      logger.error(`Parser spawn error for log ${flightLogId}: ${err.message}`);
      reject(err);
    });
  });
};

module.exports = { spawnParser };
