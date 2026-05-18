require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const User = require('../models/User');
const Drone = require('../models/Drone');
const Operator = require('../models/Operator');
const Battery = require('../models/Battery');
const Mission = require('../models/Mission');
const FlightLog = require('../models/FlightLog');
const ParsedFlightData = require('../models/ParsedFlightData');

const connectDB = require('../config/database');
const logger = require('../config/logger');

const DATA_DIR = path.join(__dirname, 'seed-data');

// ── Minimal CSV parser (handles quoted fields + CRLF) ───────────────────
const parseCSV = (text) => {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { field += c; }
    } else {
      if (c === '"') { inQuotes = true; }
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else { field += c; }
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }

  const header = rows.shift().map((h) => h.trim());
  return rows
    .filter((r) => r.some((v) => v && v.trim() !== ''))
    .map((r) => {
      const obj = {};
      header.forEach((h, idx) => { obj[h] = (r[idx] ?? '').trim(); });
      return obj;
    });
};

// ── frameType normalisation map (#001) ──────────────────────────────────
const FRAME_TYPE_MAP = {
  quadcopter: 'quadcopter',
  hexacopter: 'hexacopter',
  octocopter: 'octocopter',
  fixed_wing: 'fixed_wing',
  vtol: 'vtol',
  tricopter: 'tricopter',
  trg: 'trg',
  '10_inch_fpv_quadcopter': 'fpv_quadcopter',
  '5_inch_fpv_quadcopter': 'fpv_quadcopter',
  fpv_quadcopter: 'fpv_quadcopter',
};

const normaliseFrameType = (raw) => {
  const key = (raw || '').trim().toLowerCase().replace(/\s+/g, '_');
  return FRAME_TYPE_MAP[key] || 'other';
};

const normaliseStatus = (raw) => {
  const v = (raw || '').trim().toLowerCase();
  return v === 'inactive' ? false : true; // isActive boolean
};

const num = (v) => {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
};

const seed = async () => {
  await connectDB();
  logger.info('🧹 Wiping ALL collections...');

  await Promise.all([
    User.deleteMany({}),
    Drone.deleteMany({}),
    Operator.deleteMany({}),
    Battery.deleteMany({}),
    Mission.deleteMany({}),
    FlightLog.deleteMany({}),
    ParsedFlightData.deleteMany({}),
  ]);
  logger.info('✅ Wipe complete (clean slate — no missions/logs/telemetry)');

  // ── USERS (#002: 26 operators + 2 super_admin, unit 17 JAK LI) ─────────
  const usersCSV = parseCSV(fs.readFileSync(path.join(DATA_DIR, 'users.csv'), 'utf8'));
  logger.info(`👥 Importing ${usersCSV.length} users from users.csv...`);

  const createdUsers = [];
  let superAdminUser = null;

  for (const row of usersCSV) {
    const user = await User.create({
      name: row.rank_name,
      email: row.email.toLowerCase(),
      password: row.password, // hashed by pre-save hook
      role: row.role === 'super_admin' ? 'super_admin' : 'operator',
      organisation: row.organisation || '17 JAK LI',
      isActive: true,
    });
    createdUsers.push({ doc: user, row });
    if (!superAdminUser && user.role === 'super_admin') superAdminUser = user;
  }

  if (!superAdminUser) throw new Error('No super_admin found in users.csv');

  // ── OPERATOR PROFILES (auto-create + link for role=operator) ──────────
  let opCount = 0;
  for (const { doc, row } of createdUsers) {
    if (doc.role !== 'operator') continue;
    await Operator.create({
      owner: superAdminUser._id,
      linkedUser: doc._id,
      name: row.rank_name,
      email: row.email.toLowerCase(),
      phone: row.phone || undefined,
      licenseNumber: row.license_number || undefined,
      licenseExpiry: row.license_expiry ? new Date(row.license_expiry) : undefined,
      isActive: true,
    });
    opCount++;
  }
  logger.info(`👨‍✈️ Created ${opCount} operator profiles`);

  // ── DRONES (#001: new fields, frameType map, kg payload, owner=cmd) ────
  const dronesCSV = parseCSV(fs.readFileSync(path.join(DATA_DIR, 'drones.csv'), 'utf8'));
  logger.info(`🚁 Importing ${dronesCSV.length} drones from drones.csv...`);

  let droneCount = 0;
  for (const row of dronesCSV) {
    await Drone.create({
      owner: superAdminUser._id,
      name: row.name,
      serialNumber: row.serial_number || undefined,
      manufacturer: row.manufacturer || undefined,
      model: row.model || undefined,
      frameType: normaliseFrameType(row.frame_type),
      flightController: row.flight_controller || undefined,
      propSize: row.prop_size || null,
      nightCapability: row.night_capb && row.night_capb.trim() !== '' ? row.night_capb.trim() : 'Nil',
      range: num(row.Range),
      ewCompliance: row.ew_compliance && row.ew_compliance.trim() !== '' ? row.ew_compliance.trim() : 'Nil',
      remarks: row.remarks || null,
      registrationNumber: row.registration_number || undefined,
      payloadCapacity: num(row.payload_capacity), // kilograms (#001)
      isActive: normaliseStatus(row.status),
      tags: row.tags ? row.tags.split('|').map((t) => t.trim()).filter(Boolean) : [],
    });
    droneCount++;
  }
  logger.info(`✅ Created ${droneCount} drones`);

  // ── Batteries: deferred (CSV pending) ─────────────────────────────────
  logger.info('🔋 Batteries skipped — battery CSV pending');

  // ── Summary ───────────────────────────────────────────────────────────
  const sa = createdUsers.filter((u) => u.doc.role === 'super_admin');
  logger.info('═══════════════════════════════════════════════');
  logger.info('✅ SEED COMPLETE (DECISIONS #001 + #002)');
  logger.info('═══════════════════════════════════════════════');
  logger.info(`  Users:      ${createdUsers.length} (${sa.length} super_admin + ${opCount} operator)`);
  logger.info(`  Operators:  ${opCount} profiles`);
  logger.info(`  Drones:     ${droneCount} (owner: commander, shared read-only)`);
  logger.info(`  Batteries:  0 (CSV pending)`);
  logger.info(`  Missions:   0 (clean slate)`);
  logger.info(`  FlightLogs: 0 (clean slate)`);
  logger.info('───────────────────────────────────────────────');
  logger.info('SUPER ADMIN LOGINS:');
  sa.forEach((u) => logger.info(`  ${u.row.email}  /  ${u.row.password}`));
  logger.info('───────────────────────────────────────────────');
  logger.info('(All operator logins are their email + password from users.csv)');
  logger.info('═══════════════════════════════════════════════');

  await mongoose.disconnect();
  process.exit(0);
};

seed().catch((err) => {
  logger.error('Seed failed:', err);
  process.exit(1);
});
