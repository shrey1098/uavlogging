require('dotenv').config();
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const User = require('../models/User');
const Drone = require('../models/Drone');
const Operator = require('../models/Operator');
const Battery = require('../models/Battery');
const Mission = require('../models/Mission');
const FlightLog = require('../models/FlightLog');
const ParsedFlightData = require('../models/ParsedFlightData');

const connectDB = require('../config/database');
const logger = require('../config/logger');

// ════════════════════════════════════════════════════════════════════════
// DETERMINISTIC RANDOMNESS — same output every run
// ════════════════════════════════════════════════════════════════════════
let _seed = 42;
const rng = () => {
  _seed = (_seed * 9301 + 49297) % 233280;
  return _seed / 233280;
};
const rand = (min, max) => rng() * (max - min) + min;
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const pickWeighted = (items, weights) => {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
};

// ════════════════════════════════════════════════════════════════════════
// RAJASTHAN SECTORS
// ════════════════════════════════════════════════════════════════════════
const RAJASTHAN_SECTORS = [
  { name: 'Jodhpur',         lat: 26.2389, lng: 73.0243, region: 'Marwar',     country: 'IN' },
  { name: 'Jaisalmer',       lat: 26.9157, lng: 70.9083, region: 'Thar West',  country: 'IN' },
  { name: 'Barmer',          lat: 25.7521, lng: 71.3963, region: 'Border',     country: 'IN' },
  { name: 'Bikaner',         lat: 28.0229, lng: 73.3119, region: 'North-West', country: 'IN' },
  { name: 'Pokhran',         lat: 26.9220, lng: 71.9152, region: 'Thar Range', country: 'IN' },
  { name: 'Suratgarh',       lat: 29.3242, lng: 73.8965, region: 'Ganganagar', country: 'IN' },
  { name: 'Sri Ganganagar',  lat: 29.9094, lng: 73.8800, region: 'Border',     country: 'IN' },
  { name: 'Phalodi',         lat: 27.1306, lng: 72.3640, region: 'Thar',       country: 'IN' },
];

const MISSION_TYPES_LIVE = ['survey', 'inspection', 'mapping', 'search_rescue', 'photography'];
const MISSION_TYPES_TRAIN = ['training', 'test_flight', 'fpv'];

// ════════════════════════════════════════════════════════════════════════
// USER DATA — 2 super_admin + 12 operators (Indian Army Sep–Hav)
// ════════════════════════════════════════════════════════════════════════
const USERS_DATA = [
  { rank: 'Maj',     name: 'Vikram Singh Rathore',     role: 'super_admin', org: '12 RAJ RIF', experience: 'senior' },
  { rank: 'Sub Maj', name: 'Devendra Pratap Singh',    role: 'super_admin', org: '12 RAJ RIF', experience: 'senior' },
  { rank: 'Hav',     name: 'Mahendra Singh Shekhawat', role: 'operator',    org: '12 RAJ RIF', experience: 'senior' },
  { rank: 'Hav',     name: 'Rajveer Singh Chauhan',    role: 'operator',    org: '12 RAJ RIF', experience: 'senior' },
  { rank: 'Nk',      name: 'Bhanwar Singh Rathore',    role: 'operator',    org: '12 RAJ RIF', experience: 'mid' },
  { rank: 'Nk',      name: 'Hanumant Singh Bhati',     role: 'operator',    org: '12 RAJ RIF', experience: 'mid' },
  { rank: 'LNk',     name: 'Karni Singh Tanwar',       role: 'operator',    org: '12 RAJ RIF', experience: 'mid' },
  { rank: 'LNk',     name: 'Tejpal Singh Rajput',      role: 'operator',    org: '12 RAJ RIF', experience: 'mid' },
  { rank: 'Sep',     name: 'Lokendra Singh Bhati',     role: 'operator',    org: '12 RAJ RIF', experience: 'junior' },
  { rank: 'Sep',     name: 'Pratap Singh Chouhan',     role: 'operator',    org: '12 RAJ RIF', experience: 'junior' },
  { rank: 'Sep',     name: 'Ranveer Singh Solanki',    role: 'operator',    org: '12 RAJ RIF', experience: 'junior' },
  { rank: 'Sep',     name: 'Yashpal Singh Khangarot',  role: 'operator',    org: '12 RAJ RIF', experience: 'junior' },
  { rank: 'Sep',     name: 'Aakash Kumar Meena',       role: 'operator',    org: '12 RAJ RIF', experience: 'junior' },
  { rank: 'Sep',     name: 'Dushyant Singh Inda',      role: 'operator',    org: '12 RAJ RIF', experience: 'junior' },
];

// ════════════════════════════════════════════════════════════════════════
// DRONE FLEET — 12 drones
// ════════════════════════════════════════════════════════════════════════
const DRONES_DATA = [
  { name: 'Ranthambore-01',  frameType: 'quadcopter', fc: 'ardupilot', mfr: 'IdeaForge',  model: 'Q6 V2',          mtow: 4900, isActive: true,  tags: ['recon', 'ISR'] },
  { name: 'Ranthambore-02',  frameType: 'quadcopter', fc: 'ardupilot', mfr: 'IdeaForge',  model: 'Q6 V2',          mtow: 4900, isActive: true,  tags: ['recon', 'ISR'] },
  { name: 'Mehrangarh-01',   frameType: 'quadcopter', fc: 'px4',       mfr: 'NewSpace',   model: 'SkyHawk',        mtow: 3200, isActive: true,  tags: ['surveillance'] },
  { name: 'Mehrangarh-02',   frameType: 'quadcopter', fc: 'ardupilot', mfr: 'Custom',     model: 'X500 V2',        mtow: 2800, isActive: false, tags: ['maintenance'] },
  { name: 'Chittor-Hex-01',  frameType: 'hexacopter', fc: 'ardupilot', mfr: 'IdeaForge',  model: 'NETRA V4',       mtow: 6500, isActive: true,  tags: ['heavy-lift', 'mapping'] },
  { name: 'Chittor-Hex-02',  frameType: 'hexacopter', fc: 'px4',       mfr: 'Custom',     model: 'Tarot 680',      mtow: 5800, isActive: true,  tags: ['mapping'] },
  { name: 'Hawk-FPV-01',     frameType: 'quadcopter', fc: 'betaflight',mfr: 'Custom',     model: 'Source One',     mtow: 850,  isActive: true,  tags: ['fpv', 'training'] },
  { name: 'Hawk-FPV-02',     frameType: 'quadcopter', fc: 'betaflight',mfr: 'Custom',     model: 'iFlight Nazgul', mtow: 920,  isActive: true,  tags: ['fpv', 'training'] },
  { name: 'Hawk-FPV-03',     frameType: 'quadcopter', fc: 'betaflight',mfr: 'Custom',     model: 'Source One',     mtow: 850,  isActive: false, tags: ['fpv', 'grounded'] },
  { name: 'Garuda-FW-01',    frameType: 'fixed_wing', fc: 'ardupilot', mfr: 'IdeaForge',  model: 'SWITCH V2',      mtow: 6500, isActive: true,  tags: ['long-range', 'surveillance'] },
  { name: 'Garuda-FW-02',    frameType: 'fixed_wing', fc: 'px4',       mfr: 'Custom',     model: 'Skywalker X8',   mtow: 5200, isActive: true,  tags: ['mapping', 'long-range'] },
  { name: 'Garuda-FW-03',    frameType: 'fixed_wing', fc: 'ardupilot', mfr: 'Custom',     model: 'Believer',       mtow: 4800, isActive: false, tags: ['repair'] },
];

// ════════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════════
const daysAgo = (days) => new Date(Date.now() - days * 86400000);
const minutesAgo = (date, mins) => new Date(date.getTime() - mins * 60000);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

const generateFlightPath = (centerLat, centerLng, durationSec, missionType) => {
  const samples = Math.min(60, Math.max(10, Math.floor(durationSec / 30)));
  const path = [];
  const radius = missionType === 'survey' ? 0.015 : missionType === 'fpv' ? 0.003 : 0.008;

  for (let i = 0; i < samples; i++) {
    const t = i / samples;
    let lat, lng, alt;

    if (missionType === 'survey' || missionType === 'mapping') {
      const lines = 6;
      const lineIdx = Math.floor(t * lines);
      const lineProgress = (t * lines) % 1;
      const dir = lineIdx % 2 === 0 ? 1 : -1;
      lat = centerLat + (lineIdx / lines - 0.5) * radius * 2;
      lng = centerLng + dir * (lineProgress - 0.5) * radius * 2;
      alt = 80 + rng() * 10;
    } else if (missionType === 'fpv') {
      lat = centerLat + Math.sin(t * 12) * radius;
      lng = centerLng + Math.cos(t * 14) * radius;
      alt = 30 + Math.sin(t * 20) * 25;
    } else {
      lat = centerLat + Math.sin(t * 2 * Math.PI) * radius;
      lng = centerLng + Math.cos(t * 2 * Math.PI) * radius;
      alt = 60 + Math.sin(t * 4) * 15;
    }
    path.push([lng, lat, alt]);
  }
  return path;
};

const generateTelemetry = (durationSec, missionType, severity) => {
  const hz = missionType === 'fpv' ? 1 : missionType === 'training' ? 0.5 : 0.2;
  const samples = Math.min(300, Math.floor(durationSec * hz));
  const telemetry = [];

  let voltage = 16.8;
  const voltageSagFactor = severity === 'incident' ? 0.35 : severity === 'minor' ? 0.18 : 0.10;

  for (let i = 0; i < samples; i++) {
    const t = (i / samples) * durationSec;
    const tNorm = i / samples;

    voltage = 16.8 - tNorm * voltageSagFactor * 16.8;
    if (severity === 'incident' && tNorm > 0.7) voltage -= 0.5;

    let mode = 'STABILIZE';
    if (tNorm < 0.05) mode = 'STABILIZE';
    else if (tNorm < 0.15) mode = 'ALT_HOLD';
    else if (tNorm < 0.85) mode = missionType === 'fpv' ? 'STABILIZE' : 'AUTO';
    else if (tNorm < 0.95) mode = 'RTL';
    else mode = 'LAND';

    telemetry.push({
      t: Math.round(t * 10) / 10,
      alt: Math.max(0, missionType === 'fpv' ? 30 + Math.sin(t * 0.5) * 20 : 60 + Math.sin(t * 0.05) * 15),
      roll: (rng() - 0.5) * (missionType === 'fpv' ? 60 : 15),
      pitch: (rng() - 0.5) * (missionType === 'fpv' ? 45 : 12),
      yaw: (t * 5) % 360,
      groundSpeed: missionType === 'fpv' ? 18 + rng() * 8 : 8 + rng() * 4,
      voltage: Math.round(voltage * 100) / 100,
      current: 12 + rng() * 18 + (severity === 'incident' && tNorm > 0.7 ? 15 : 0),
      batteryRemaining: Math.max(0, 100 - tNorm * 80),
      flightMode: mode,
      armed: tNorm > 0.02 && tNorm < 0.98,
    });
  }
  return telemetry;
};

const generateEvents = (durationSec, severity, missionType) => {
  const events = [];
  events.push({ t: 0, type: 'arm',     severity: 'info', description: 'Vehicle armed' });
  events.push({ t: 5, type: 'takeoff', severity: 'info', description: 'Takeoff initiated' });

  if (missionType === 'survey' || missionType === 'mapping') {
    events.push({ t: 15, type: 'mission_start', severity: 'info', description: 'Auto mission started' });
    const wpCount = randInt(4, 12);
    for (let i = 0; i < wpCount; i++) {
      events.push({
        t: 20 + (i * (durationSec - 60) / wpCount),
        type: 'waypoint_reached',
        severity: 'info',
        description: `Waypoint ${i + 1} reached`,
      });
    }
    events.push({ t: durationSec - 40, type: 'mission_end', severity: 'info', description: 'Mission complete' });
  }

  if (severity === 'minor') {
    const issue = pick([
      { type: 'gps_loss',     severity: 'warning', desc: 'GPS satellites dropped below 6 briefly' },
      { type: 'battery_low',  severity: 'warning', desc: 'Battery voltage low warning triggered' },
      { type: 'mode_change',  severity: 'info',    desc: 'Mode changed to RTL by GCS' },
    ]);
    events.push({ t: durationSec * 0.6, type: issue.type, severity: issue.severity, description: issue.desc });
  }

  if (severity === 'incident') {
    const incident = pick([
      { type: 'failsafe',         severity: 'critical', desc: 'Failsafe triggered: signal loss' },
      { type: 'battery_critical', severity: 'critical', desc: 'Battery critical — RTL forced' },
      { type: 'ekf_error',        severity: 'critical', desc: 'EKF variance exceeded threshold' },
      { type: 'fence_breach',     severity: 'warning',  desc: 'Geofence breach detected' },
    ]);
    events.push({ t: durationSec * 0.65, type: incident.type, severity: incident.severity, description: incident.desc });
    events.push({ t: durationSec * 0.7, type: 'rtl', severity: 'warning', description: 'Auto RTL engaged' });
  }

  events.push({ t: durationSec - 5, type: 'land',   severity: 'info', description: 'Landed' });
  events.push({ t: durationSec - 2, type: 'disarm', severity: 'info', description: 'Vehicle disarmed' });
  return events;
};

const generateAlerts = (severity) => {
  if (severity === 'clean') return [];
  const alerts = [];

  if (severity === 'minor') {
    alerts.push(pick([
      { type: 'voltage_sag',    severity: 'warning', peakValue: 14.2, threshold: 14.4, description: 'Voltage sag under load' },
      { type: 'gps_glitch',     severity: 'warning', peakValue: 5,    threshold: 6,    description: 'GPS satellite count dropped briefly' },
      { type: 'high_vibration', severity: 'warning', peakValue: 18,   threshold: 15,   description: 'Vibration on Z-axis exceeded threshold' },
    ]));
  }

  if (severity === 'incident') {
    alerts.push({ type: 'voltage_sag', severity: 'critical', peakValue: 13.1, threshold: 14.4, description: 'Critical voltage sag — battery near depletion' });
    alerts.push(pick([
      { type: 'ekf_variance',       severity: 'critical', peakValue: 0.95, threshold: 0.5, description: 'EKF position variance critical' },
      { type: 'motor_imbalance',    severity: 'critical', peakValue: 28,   threshold: 15,  description: 'Motor output imbalance detected' },
      { type: 'attitude_deviation', severity: 'critical', peakValue: 65,   threshold: 45,  description: 'Attitude deviation from setpoint exceeded' },
    ]));
  }
  return alerts;
};

// ════════════════════════════════════════════════════════════════════════
// MAIN SEED
// ════════════════════════════════════════════════════════════════════════
const seed = async () => {
  await connectDB();
  logger.info('🧹 Wiping existing data...');

  await Promise.all([
    User.deleteMany({}),
    Drone.deleteMany({}),
    Operator.deleteMany({}),
    Battery.deleteMany({}),
    Mission.deleteMany({}),
    FlightLog.deleteMany({}),
    ParsedFlightData.deleteMany({}),
  ]);
  logger.info('✅ Wipe complete');

  // ── Users ────────────────────────────────────────────────────────────
  logger.info('👥 Creating 14 users...');
  const users = [];
  for (let i = 0; i < USERS_DATA.length; i++) {
    const u = USERS_DATA[i];
    const email = `${u.rank.toLowerCase().replace(/\s/g, '')}.${slug(u.name.split(' ')[0])}@12rajrif.in`;
    const password = u.role === 'super_admin' ? 'Admin1234!' : 'Operator1234!';
    const user = await User.create({
      name: `${u.rank} ${u.name}`,
      email,
      password,
      role: u.role,
      organisation: u.org,
      isActive: true,
      lastLogin: daysAgo(randInt(0, 5)),
    });
    users.push({ ...user.toObject(), experience: u.experience, rank: u.rank });
  }
  const superAdmin = users[0];

  // ── Drones ───────────────────────────────────────────────────────────
  logger.info('🚁 Creating 12 drones...');
  const drones = [];
  for (let i = 0; i < DRONES_DATA.length; i++) {
    const d = DRONES_DATA[i];
    const totalFlights = d.isActive ? randInt(30, 200) : randInt(50, 350);
    const drone = await Drone.create({
      owner: superAdmin._id,
      name: d.name,
      serialNumber: `${slug(d.name).toUpperCase()}-${String(2024000 + i * 17).padStart(7, '0')}`,
      manufacturer: d.mfr,
      model: d.model,
      frameType: d.frameType,
      flightController: d.fc,
      maxTakeoffWeight: d.mtow,
      payloadCapacity: Math.round(d.mtow * 0.3),
      totalFlightTime: totalFlights * randInt(900, 2400),
      totalFlights,
      isActive: d.isActive,
      tags: d.tags,
      registrationNumber: `DGCA-RJ-${2024000 + i * 13}`,
    });
    drones.push(drone);
  }

  // ── Operators ────────────────────────────────────────────────────────
  logger.info('👨‍✈️ Creating operator profiles...');
  const operators = [];
  for (const u of users.filter(x => x.role === 'operator')) {
    const expFlights = u.experience === 'senior' ? randInt(200, 350)
                     : u.experience === 'mid'    ? randInt(80, 180)
                     : randInt(15, 60);
    const op = await Operator.create({
      owner: superAdmin._id,
      linkedUser: u._id,
      name: u.name,
      email: u.email,
      phone: `+91-9${randInt(100000000, 999999999)}`,
      licenseNumber: `IAF-DRONE-${randInt(10000, 99999)}`,
      licenseExpiry: daysAgo(-randInt(180, 720)),
      totalFlights: expFlights,
      totalFlightTime: expFlights * randInt(900, 2100),
      isActive: true,
    });
    operators.push({ ...op.toObject(), userId: u._id, experience: u.experience });
  }

  // ── Batteries ────────────────────────────────────────────────────────
  logger.info('🔋 Creating 20 batteries...');
  const batteries = [];
  for (let i = 0; i < 20; i++) {
    const cellCount = pick([4, 4, 6, 6, 6]);
    const capacity = cellCount === 4 ? pick([5000, 6000]) : pick([10000, 12000, 16000]);
    const battery = await Battery.create({
      owner: superAdmin._id,
      name: `LiPo ${cellCount}S ${capacity}mAh #${String(i + 1).padStart(2, '0')}`,
      serialNumber: `BAT-${cellCount}S-${capacity}-${String(i + 1).padStart(3, '0')}`,
      manufacturer: pick(['Tattu', 'GensAce', 'CNHL', 'SLS']),
      chemistry: 'lipo',
      cellCount,
      capacity,
      nominalVoltage: cellCount * 3.7,
      maxVoltage: cellCount * 4.2,
      minVoltage: cellCount * 3.3,
      maxCurrentRating: capacity / 1000 * 30,
      cycleCount: randInt(20, 180),
      maxCycles: 300,
      totalFlightTime: randInt(20, 180) * randInt(900, 1800),
      status: 'active',
      purchaseDate: daysAgo(randInt(60, 540)),
    });
    batteries.push(battery);
  }

  // ── Missions + Flight Logs + Parsed Data ─────────────────────────────
  logger.info('🎯 Creating 40 missions + ~80 flight logs + parsed data...');
  const missions = [];
  const flightLogs = [];
  const parsedDataDocs = [];

  for (let i = 0; i < 40; i++) {
    const isTraining = i < 20;
    const missionType = isTraining ? pick(MISSION_TYPES_TRAIN) : pick(MISSION_TYPES_LIVE);
    const sector = pick(RAJASTHAN_SECTORS);

    let compatibleDrones;
    if (missionType === 'fpv') {
      compatibleDrones = drones.filter(d => d.name.includes('FPV') && d.isActive);
    } else if (missionType === 'mapping' || missionType === 'survey') {
      compatibleDrones = drones.filter(d => (d.frameType === 'hexacopter' || d.frameType === 'fixed_wing') && d.isActive);
    } else {
      compatibleDrones = drones.filter(d => d.isActive);
    }
    if (compatibleDrones.length === 0) compatibleDrones = drones.filter(d => d.isActive);
    const drone = pick(compatibleDrones);

    let opPool;
    if (isTraining) {
      opPool = operators.filter(o => o.experience === 'junior' || o.experience === 'mid');
    } else {
      opPool = operators.filter(o => o.experience === 'senior' || o.experience === 'mid');
    }
    const op = pick(opPool);
    const opUserId = op.userId;

    const batteryCount = missionType === 'fpv' ? 1 : randInt(1, 2);
    const usedBatteries = [];
    for (let b = 0; b < batteryCount; b++) usedBatteries.push(pick(batteries)._id);

    const daysOld = randInt(1, 365);
    const startTime = daysAgo(daysOld);
    const durationSec = isTraining
      ? (missionType === 'fpv' ? randInt(180, 480) : randInt(300, 900))
      : randInt(900, 2700);
    const endTime = new Date(startTime.getTime() + durationSec * 1000);
    const severity = pickWeighted(['clean', 'minor', 'incident'], [70, 20, 10]);

    const missionName = isTraining
      ? `Training - ${sector.name} - ${slug(missionType)} ${String(i + 1).padStart(2, '0')}`
      : `Op ${pick(['MARU', 'THAR', 'VIGIL', 'PRAHARI', 'SAMPRITI'])} - ${sector.name} - ${String(i + 1).padStart(2, '0')}`;

    const mission = await Mission.create({
      owner: opUserId,
      drone: drone._id,
      operator: op._id,
      batteries: usedBatteries,
      name: missionName,
      missionType,
      status: 'verified',
      location: {
        name: sector.name,
        country: sector.country,
        region: sector.region,
        coordinates: { type: 'Point', coordinates: [sector.lng, sector.lat] },
      },
      plannedStart: startTime,
      plannedEnd: endTime,
      actualStart: startTime,
      actualEnd: endTime,
      flightDuration: durationSec,
      maxAltitude: missionType === 'fpv' ? randInt(40, 80) : missionType === 'mapping' ? randInt(80, 120) : randInt(50, 100),
      maxSpeed: missionType === 'fpv' ? rand(18, 28) : rand(8, 15),
      totalDistance: durationSec * (missionType === 'fpv' ? 20 : 10),
      maxWindSpeed: rand(3, 12),
      conditions: {
        weather: pick(['clear', 'clear', 'clear', 'cloudy', 'strong_wind']),
        temperatureCelsius: randInt(18, 42),
        windSpeedMs: rand(2, 10),
        windDirection: pick(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']),
        visibility: pick(['excellent', 'good', 'moderate']),
      },
      airspaceClass: 'restricted',
      pilotInCommand: op.name,
      flightPurpose: isTraining ? 'Operator training and proficiency' : `${missionType} mission in ${sector.name} sector`,
      tags: [isTraining ? 'training' : 'live', sector.name.toLowerCase()],
      notes: severity === 'incident' ? 'Incident logged — see parsed alerts.' : severity === 'minor' ? 'Minor anomaly noted.' : 'Routine flight completed.',
    });

    const logCount = isTraining ? 1 : pickWeighted([1, 2], [60, 40]);
    let firstLogId = null;

    for (let l = 0; l < logCount; l++) {
      const logType = drone.flightController === 'ardupilot' ? 'ardupilot_bin'
                    : drone.flightController === 'px4'       ? 'px4_ulg'
                    : 'ardupilot_bin';

      const storedName = `${uuidv4()}.${logType === 'px4_ulg' ? 'ulg' : 'bin'}`;
      const originalName = `${slug(drone.name)}_${startTime.toISOString().split('T')[0]}_${l + 1}.${logType === 'px4_ulg' ? 'ulg' : 'bin'}`;

      const flightLog = await FlightLog.create({
        owner: opUserId,
        mission: mission._id,
        originalName,
        storedName,
        filePath: `uploads/raw/${storedName}`,
        fileSize: randInt(2_000_000, 28_000_000),
        mimeType: 'application/octet-stream',
        logType,
        parseStatus: 'completed',
        parseStartedAt: minutesAgo(endTime, -2),
        parseCompletedAt: minutesAgo(endTime, -1),
        parserVersion: '1.0.0',
        uploadedAt: minutesAgo(endTime, -3),
        checksum: uuidv4().replace(/-/g, ''),
      });

      const flightPath = generateFlightPath(sector.lat, sector.lng, durationSec, missionType);
      const telemetry = generateTelemetry(durationSec, missionType, severity);
      const events = generateEvents(durationSec, severity, missionType);
      const alerts = generateAlerts(severity);

      const flightModes = [];
      let lastMode = telemetry[0]?.flightMode || 'STABILIZE';
      let modeStart = 0;
      for (let s = 1; s < telemetry.length; s++) {
        if (telemetry[s].flightMode !== lastMode) {
          flightModes.push({ mode: lastMode, tStart: modeStart, tEnd: telemetry[s].t, durationSeconds: telemetry[s].t - modeStart });
          lastMode = telemetry[s].flightMode;
          modeStart = telemetry[s].t;
        }
      }
      flightModes.push({ mode: lastMode, tStart: modeStart, tEnd: durationSec, durationSeconds: durationSec - modeStart });

      const voltages = telemetry.map(t => t.voltage);
      const currents = telemetry.map(t => t.current);
      const alts = telemetry.map(t => t.alt);
      const speeds = telemetry.map(t => t.groundSpeed);

      const parsedData = await ParsedFlightData.create({
        flightLog: flightLog._id,
        mission: mission._id,
        owner: opUserId,
        summary: {
          startTime, endTime, durationSeconds: durationSec,
          maxAltitude: Math.max(...alts), minAltitude: Math.min(...alts),
          avgAltitude: alts.reduce((a, b) => a + b, 0) / alts.length,
          maxGroundSpeed: Math.max(...speeds),
          avgGroundSpeed: speeds.reduce((a, b) => a + b, 0) / speeds.length,
          maxAirspeed: Math.max(...speeds) * 1.1,
          totalDistance: durationSec * (missionType === 'fpv' ? 20 : 10),
          maxRoll: missionType === 'fpv' ? 55 : 18,
          maxPitch: missionType === 'fpv' ? 42 : 14,
          maxVoltage: Math.max(...voltages), minVoltage: Math.min(...voltages),
          avgVoltage: voltages.reduce((a, b) => a + b, 0) / voltages.length,
          maxCurrent: Math.max(...currents),
          avgCurrent: currents.reduce((a, b) => a + b, 0) / currents.length,
          totalMahUsed: Math.round((currents.reduce((a, b) => a + b, 0) / currents.length) * durationSec / 3.6),
          maxSatellites: randInt(14, 22), avgSatellites: randInt(10, 16),
          minHdop: rand(0.6, 1.0), maxHdop: rand(1.2, 2.5),
          maxVibrationX: rand(5, severity === 'incident' ? 35 : severity === 'minor' ? 22 : 12),
          maxVibrationY: rand(5, severity === 'incident' ? 32 : severity === 'minor' ? 20 : 11),
          maxVibrationZ: rand(8, severity === 'incident' ? 40 : severity === 'minor' ? 25 : 14),
          maxMotorTemp: randInt(45, severity === 'incident' ? 85 : 65),
          maxEscTemp: randInt(50, severity === 'incident' ? 90 : 70),
          homeLat: sector.lat, homeLng: sector.lng, homeAlt: rand(50, 350),
        },
        telemetry,
        telemetrySampleRate: missionType === 'fpv' ? 1 : 0.2,
        totalRawSamples: Math.round(durationSec * (drone.flightController === 'px4' ? 50 : 25)),
        flightPath: { type: 'LineString', coordinates: flightPath },
        events, alerts, flightModes,
        parserMeta: {
          parserVersion: '1.0.0',
          logFormat: logType,
          firmwareVersion: drone.flightController === 'ardupilot' ? 'ArduCopter V4.5.3' : 'PX4 v1.14.2',
          hardwareId: `HW-${randInt(100000, 999999)}`,
          autopilotType: drone.flightController,
          vehicleType: drone.frameType,
        },
        anomalyScore: severity === 'incident' ? randInt(65, 92) : severity === 'minor' ? randInt(25, 55) : randInt(5, 22),
      });

      flightLog.parsedData = parsedData._id;
      await flightLog.save();
      flightLogs.push(flightLog);
      parsedDataDocs.push(parsedData);
      if (l === 0) firstLogId = flightLog._id;
    }

    mission.flightLog = firstLogId;
    await mission.save();
    missions.push(mission);

    if ((i + 1) % 10 === 0) logger.info(`  → ${i + 1}/40 missions seeded`);
  }

  // ── Summary ──────────────────────────────────────────────────────────
  logger.info('═══════════════════════════════════════════════');
  logger.info('✅ SEED COMPLETE');
  logger.info('═══════════════════════════════════════════════');
  logger.info(`  Users:        ${users.length} (${users.filter(u => u.role === 'super_admin').length} super_admin + ${users.filter(u => u.role === 'operator').length} operator)`);
  logger.info(`  Drones:       ${drones.length} (${drones.filter(d => d.isActive).length} active, ${drones.filter(d => !d.isActive).length} inactive)`);
  logger.info(`  Operators:    ${operators.length}`);
  logger.info(`  Batteries:    ${batteries.length} (all active)`);
  logger.info(`  Missions:     ${missions.length} (20 training + 20 live)`);
  logger.info(`  Flight logs:  ${flightLogs.length}`);
  logger.info(`  Parsed data:  ${parsedDataDocs.length}`);
  logger.info('───────────────────────────────────────────────');
  logger.info('LOGIN CREDENTIALS:');
  logger.info(`  Super Admin:  ${users[0].email} / Admin1234!`);
  logger.info(`  Super Admin:  ${users[1].email} / Admin1234!`);
  logger.info(`  Operator:     ${users[2].email} / Operator1234!`);
  logger.info(`  (12 operators total — all use password: Operator1234!)`);
  logger.info('═══════════════════════════════════════════════');

  await mongoose.disconnect();
  process.exit(0);
};

seed().catch((err) => {
  logger.error('Seed failed:', err);
  process.exit(1);
});
