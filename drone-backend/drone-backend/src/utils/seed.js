/**
 * seed-flight-data.js — generate realistic flight logs + parsed data +
 * operator progress directly in the DB. Bypasses upload/parser pipeline.
 *
 * Targets a controlled readiness distribution:
 *   - ~25% of operators → READY (75+ readiness)
 *   - ~75% of operators → MID   (50–74 readiness)
 *
 * Each operator gets 15–40 logs with realistic manual inputs
 * (timeClass, typeClass, drone, dropScore) and parsed telemetry summary.
 *
 * Usage:
 *   node src/utils/seed-flight-data.js            # confirmation prompt
 *   node src/utils/seed-flight-data.js --yes      # skip prompt
 *
 * Idempotency: this ADDS data. Run wipe-flight-data.js first for a clean
 * slate, or it will stack on top of existing logs.
 */

require('dotenv').config();
const readline = require('readline');
const mongoose = require('mongoose');

const connectDB = require('../config/database');
const logger = require('../config/logger');

const User = require('../models/User');
const Operator = require('../models/Operator');
const Drone = require('../models/Drone');
const FlightLog = require('../models/FlightLog');
const ParsedFlightData = require('../models/ParsedFlightData');
const { OperatorProgress } = require('../models/OperatorProgress');

// ── Deterministic RNG (seed) so reruns are reproducible ─────────────────
let _s = 20260617;
const rng = () => { _s = (_s * 9301 + 49297) % 233280; return _s / 233280; };
const rand = (a, b) => rng() * (b - a) + a;
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(rng() * arr.length)];

// Udaipur center (matches the unit's AO from earlier test data)
const CENTER_LAT = 24.5854;
const CENTER_LNG = 73.7125;

const TYPE_CLASSES = ['surveillance', 'drop', 'obstacle', 'navigation', 'fpv'];
const DROP_SCORES = [0, 10, 25, 50, 75];
const LOG_TYPES = ['ardupilot_bin', 'px4_ulg', 'csv', 'ardupilot_tlog'];

// Profile band definitions (verified to land in target ranges).
const PROFILES = {
  ready: {
    anomalyRange: [6, 20],
    recencyDays: [2, 11],
    sortieRange: [28, 40],
    hoursPerSortie: [0.6, 1.4],
    realOpsRange: [2, 6],
  },
  mid: {
    anomalyRange: [24, 42],
    recencyDays: [18, 38],
    sortieRange: [15, 24],
    hoursPerSortie: [0.5, 1.2],
    realOpsRange: [0, 1],
  },
};

const confirm = (q) => new Promise((resolve) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(q, (a) => { rl.close(); resolve(a.trim().toLowerCase()); });
});

const makeSummary = (durationSec, startDate) => {
  const endDate = new Date(startDate.getTime() + durationSec * 1000);
  const maxAlt = parseFloat(rand(40, 120).toFixed(1));
  const maxSpeed = parseFloat(rand(8, 22).toFixed(1));
  const totalDistance = Math.round(rand(800, 8000)); // metres
  const hasPower = rng() > 0.25;
  return {
    startTime: startDate,
    endTime: endDate,
    // Write BOTH names — schema uses durationSeconds; parser/frontend
    // also read flightDuration. Cover both to avoid drift.
    durationSeconds: durationSec,
    flightDuration: durationSec,
    maxAltitude: maxAlt,
    minAltitude: 0,
    avgAltitude: parseFloat((maxAlt * 0.6).toFixed(1)),
    maxSpeed,
    avgSpeed: parseFloat((maxSpeed * 0.55).toFixed(1)),
    totalDistance,
    maxVoltage: hasPower ? parseFloat(rand(16.4, 16.8).toFixed(2)) : null,
    minVoltage: hasPower ? parseFloat(rand(13.6, 14.6).toFixed(2)) : null,
    avgVoltage: hasPower ? parseFloat(rand(14.8, 15.8).toFixed(2)) : null,
    maxCurrent: hasPower ? parseFloat(rand(22, 48).toFixed(1)) : null,
    avgCurrent: hasPower ? parseFloat(rand(12, 26).toFixed(1)) : null,
    gpsSatCount: randInt(9, 18),
    maxVibration: parseFloat(rand(8, 35).toFixed(1)),
    homePoint: {
      lat: parseFloat((CENTER_LAT + rand(-0.04, 0.04)).toFixed(6)),
      lng: parseFloat((CENTER_LNG + rand(-0.04, 0.04)).toFixed(6)),
      alt: 0,
    },
  };
};

const makeAlerts = (anomaly) => {
  const alerts = [];
  const n = anomaly > 35 ? randInt(2, 4) : anomaly > 20 ? randInt(0, 2) : randInt(0, 1);
  const types = ['high_vibration', 'voltage_sag', 'gps_glitch', 'ekf_variance', 'wind_shear', 'compass_interference'];
  for (let i = 0; i < n; i++) {
    alerts.push({
      type: pick(types),
      severity: anomaly > 35 ? pick(['warning', 'critical']) : 'info',
      tStart: parseFloat(rand(10, 200).toFixed(1)),
      tEnd: parseFloat(rand(210, 400).toFixed(1)),
      peakValue: parseFloat(rand(30, 90).toFixed(1)),
      threshold: 60,
      description: 'Auto-generated seed alert',
    });
  }
  return alerts;
};

const makeEvents = (durationSec) => ([
  { t: 0, type: 'arm', severity: 'info', description: 'Armed' },
  { t: 3, type: 'takeoff', severity: 'info', description: 'Takeoff' },
  { t: durationSec - 8, type: 'land', severity: 'info', description: 'Landing' },
  { t: durationSec - 2, type: 'disarm', severity: 'info', description: 'Disarmed' },
]);

/**
 * Generate telemetry samples. The frontend charts read these exact keys
 * off each sample: t, alt, speed, voltage, current (plus lat/lng/altAmsL
 * for the map). ~60 samples gives smooth graphs without bloating docs.
 *
 * Shapes are physically plausible: altitude climbs then descends,
 * voltage sags over the flight, speed varies, current tracks load.
 */
const makeTelemetry = (durationSec, summary, hasPower) => {
  const N = 60;
  const samples = [];
  const startV = summary.maxVoltage || 16.7;
  const endV = summary.minVoltage || 14.2;
  const baseLat = summary.homePoint.lat;
  const baseLng = summary.homePoint.lng;
  for (let i = 0; i < N; i++) {
    const f = i / (N - 1);          // 0..1 progress
    const t = parseFloat((f * durationSec).toFixed(1));
    // Altitude: climb to max by ~25%, cruise, descend after ~80%.
    let altFactor;
    if (f < 0.25) altFactor = f / 0.25;
    else if (f < 0.8) altFactor = 1 - Math.abs(Math.sin(f * 6)) * 0.15;
    else altFactor = (1 - f) / 0.2;
    const alt = parseFloat(Math.max(0, summary.maxAltitude * altFactor).toFixed(1));
    // Speed: varies around avg, dips at start/end.
    const speedEnv = Math.sin(f * Math.PI);
    const speed = parseFloat(Math.max(0, summary.maxSpeed * (0.4 + 0.6 * speedEnv) + rand(-1, 1)).toFixed(2));
    // Voltage: linear sag start->end with small noise.
    const voltage = hasPower
      ? parseFloat((startV - (startV - endV) * f + rand(-0.05, 0.05)).toFixed(2))
      : null;
    // Current: tracks speed/climb load.
    const current = hasPower
      ? parseFloat(((summary.avgCurrent || 18) * (0.6 + 0.8 * speedEnv) + rand(-1.5, 1.5)).toFixed(1))
      : null;
    samples.push({
      t,
      lat: parseFloat((baseLat + Math.sin(f * 2 * Math.PI) * 0.01).toFixed(6)),
      lng: parseFloat((baseLng + Math.cos(f * 2 * Math.PI) * 0.01).toFixed(6)),
      alt,
      altAmsl: parseFloat((alt + 450).toFixed(1)),
      roll: parseFloat(rand(-12, 12).toFixed(1)),
      pitch: parseFloat(rand(-10, 10).toFixed(1)),
      yaw: parseFloat(((t * 7) % 360).toFixed(1)),
      groundSpeed: speed,
      // Frontend reads `speed` directly — include it as well as groundSpeed.
      speed,
      heading: parseFloat(((t * 7) % 360).toFixed(1)),
      voltage,
      current,
      batteryRemaining: Math.round(Math.max(0, 100 - f * 80)),
      flightMode: f < 0.05 ? 'STABILIZE' : f < 0.8 ? 'AUTO' : f < 0.95 ? 'RTL' : 'LAND',
      armed: f > 0.02 && f < 0.98,
    });
  }
  return samples;
};

const seed = async () => {
  await connectDB();

  const operatorUsers = await User.find({ role: 'operator' }).select('_id name email').lean();
  const drones = await Drone.find({}).select('_id frameType name').lean();

  if (operatorUsers.length === 0) {
    logger.error('No operator users found. Seed users/drones first.');
    await mongoose.disconnect();
    process.exit(1);
  }
  if (drones.length === 0) {
    logger.error('No drones found. Seed drones first.');
    await mongoose.disconnect();
    process.exit(1);
  }

  const total = operatorUsers.length;
  const readyCount = Math.round(total * 0.25);
  const shuffled = [...operatorUsers].sort(() => rng() - 0.5);
  const assignment = new Map();
  shuffled.forEach((u, i) => assignment.set(String(u._id), i < readyCount ? 'ready' : 'mid'));

  logger.info('═══════════════════════════════════════════════');
  logger.info('  FLIGHT DATA SEED');
  logger.info(`    Operators:   ${total}`);
  logger.info(`    READY (75+): ${readyCount}`);
  logger.info(`    MID (50-74): ${total - readyCount}`);
  logger.info(`    Drones:      ${drones.length}`);
  logger.info(`    Logs/op:     15–40`);
  logger.info('═══════════════════════════════════════════════');

  if (!process.argv.includes('--yes')) {
    const ans = await confirm('Type "SEED" to generate this data: ');
    if (ans !== 'seed') {
      logger.info('Aborted.');
      await mongoose.disconnect();
      process.exit(0);
    }
  }

  const now = Date.now();
  let totalLogs = 0;

  for (const user of operatorUsers) {
    const profileKey = assignment.get(String(user._id));
    const P = PROFILES[profileKey];

    const sortieCount = randInt(P.sortieRange[0], P.sortieRange[1]);
    const realOpsTarget = randInt(P.realOpsRange[0], P.realOpsRange[1]);
    const mostRecentDaysAgo = rand(P.recencyDays[0], P.recencyDays[1]);

    const timeCounts = { day: 0, night: 0 };
    const typeCounts = { surveillance: 0, drop: 0, obstacle: 0, navigation: 0, fpv: 0 };
    let realOpsCount = 0;
    let countedSorties = 0;
    let countedFlightSeconds = 0;
    let lastFlightAt = null;

    const logDocs = [];
    const parsedDocs = [];

    for (let i = 0; i < sortieCount; i++) {
      const daysAgo = mostRecentDaysAgo + i * rand(2, 6);
      const flightDate = new Date(now - daysAgo * 86400000);
      if (!lastFlightAt || flightDate > lastFlightAt) lastFlightAt = flightDate;

      const timeClass = rng() > 0.7 ? 'night' : 'day';
      const typeClass = pick(TYPE_CLASSES);
      const drone = pick(drones);
      const durationSec = Math.round(rand(P.hoursPerSortie[0], P.hoursPerSortie[1]) * 3600);
      const anomaly = Math.round(rand(P.anomalyRange[0], P.anomalyRange[1]));
      const isRealOps = realOpsCount < realOpsTarget;
      const dropScore = typeClass === 'drop' ? pick([...DROP_SCORES, null]) : null;

      const logId = new mongoose.Types.ObjectId();
      const parsedId = new mongoose.Types.ObjectId();
      const ext = pick(['bin', 'ulg', 'csv', 'tlog']);
      const storedName = `${logId}.${ext}`;
      const startDate = flightDate;
      const summary = makeSummary(durationSec, startDate);
      const hasPower = summary.maxVoltage !== null;
      const telemetry = makeTelemetry(durationSec, summary, hasPower);

      logDocs.push({
        _id: logId,
        owner: user._id,
        drone: drone._id,
        originalName: `${user.email.split('@')[0]}_${flightDate.toISOString().slice(0, 10)}_${i + 1}.${ext}`,
        storedName,
        filePath: null,
        r2Key: `flight-logs/${logId}/${storedName}`,
        fileSize: randInt(2000000, 80000000),
        mimeType: 'application/octet-stream',
        logType: pick(LOG_TYPES),
        timeClass,
        typeClass,
        isRealOps,
        dropScore,
        parseStatus: 'completed',
        parseStartedAt: new Date(startDate.getTime() + 1000),
        parseCompletedAt: new Date(startDate.getTime() + 30000),
        parsedData: parsedId,
        progressAppliedAt: new Date(startDate.getTime() + 31000),
        mission: null,
        uploadedAt: startDate,
        createdAt: startDate,
        updatedAt: startDate,
      });

      parsedDocs.push({
        _id: parsedId,
        flightLog: logId,
        owner: user._id,
        mission: null,
        summary,
        telemetry,
        telemetrySampleRate: 1,
        flightPath: {
          type: 'LineString',
          coordinates: [
            [summary.homePoint.lng, summary.homePoint.lat, 0],
            [
              parseFloat((summary.homePoint.lng + rand(-0.01, 0.01)).toFixed(6)),
              parseFloat((summary.homePoint.lat + rand(-0.01, 0.01)).toFixed(6)),
              parseFloat(rand(20, 80).toFixed(1)),
            ],
          ],
        },
        events: makeEvents(durationSec),
        alerts: makeAlerts(anomaly),
        // flightModes: schema subdoc defines mode/tStart/tEnd/durationSeconds.
        // NOTE: the frontend reads startTime/endTime/duration instead — a
        // known field-name drift. We write the schema's keys (extra keys
        // get stripped by Mongoose). The mode-bar drift is flagged
        // separately; it needs a frontend/contract fix, not a seed fix.
        flightModes: [
          { mode: 'STABILIZE', tStart: 0, tEnd: Math.round(durationSec * 0.05), durationSeconds: Math.round(durationSec * 0.05) },
          { mode: 'AUTO', tStart: Math.round(durationSec * 0.05), tEnd: Math.round(durationSec * 0.8), durationSeconds: Math.round(durationSec * 0.75) },
          { mode: 'RTL', tStart: Math.round(durationSec * 0.8), tEnd: Math.round(durationSec * 0.95), durationSeconds: Math.round(durationSec * 0.15) },
          { mode: 'LAND', tStart: Math.round(durationSec * 0.95), tEnd: durationSec, durationSeconds: Math.round(durationSec * 0.05) },
        ],
        parserMeta: {
          parserVersion: 'seed-1.0',
          logFormat: 'seed',
          autopilotType: pick(['ArduCopter', 'PX4']),
          vehicleType: drone.frameType || 'quadcopter',
        },
        anomalyScore: anomaly,
        createdAt: startDate,
        updatedAt: startDate,
      });

      timeCounts[timeClass]++;
      typeCounts[typeClass]++;
      countedSorties++;
      countedFlightSeconds += durationSec;
      if (isRealOps) realOpsCount++;
    }

    await FlightLog.insertMany(logDocs);
    await ParsedFlightData.insertMany(parsedDocs);

    await OperatorProgress.findOneAndUpdate(
      { owner: user._id },
      {
        $set: {
          owner: user._id,
          timeCounts,
          typeCounts,
          realOpsCount,
          countedSorties,
          countedFlightSeconds,
          lastFlightAt,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    totalLogs += logDocs.length;
    logger.info(`  ${user.name}: ${logDocs.length} logs [${profileKey}] realOps=${realOpsCount}`);
  }

  logger.info('═══════════════════════════════════════════════');
  logger.info(`✅ SEED COMPLETE — ${totalLogs} logs across ${total} operators`);
  logger.info('   Readiness reflects immediately (OperatorProgress set directly).');
  logger.info('   Verify: GET /api/readiness (super_admin)');
  logger.info('═══════════════════════════════════════════════');

  await mongoose.disconnect();
  process.exit(0);
};

seed().catch((err) => {
  logger.error('Seed failed:', err);
  process.exit(1);
});