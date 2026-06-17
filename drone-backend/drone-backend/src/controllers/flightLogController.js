const fs = require('fs');
const path = require('path');
const FlightLog = require('../models/FlightLog');
const Mission = require('../models/Mission');
const User = require('../models/User');
const { detectLogType } = require('../config/upload');
const { putObject, buildR2Key } = require('../config/r2');
const { sendSuccess, sendCreated, sendNotFound, sendError } = require('../utils/response');
const logger = require('../config/logger');
const { spawnParser } = require('../workers/parserWorker');
const { buildScopeFilter } = require('./scopeFilter');

// #010 — allowed drop score values. null is also valid (not scored).
const DROP_SCORE_VALUES = [0, 10, 25, 50, 75];

/**
 * Validate a drop score candidate. Returns { ok, value } or { ok:false }.
 * Accepts: null/empty (→ null), or one of the allowed integers.
 */
const parseDropScore = (raw) => {
  if (raw === undefined || raw === null || raw === '' || raw === 'null') {
    return { ok: true, value: null };
  }
  const n = Number(raw);
  if (Number.isInteger(n) && DROP_SCORE_VALUES.includes(n)) {
    return { ok: true, value: n };
  }
  return { ok: false };
};

exports.uploadLog = async (req, res, next) => {
  try {
    if (!req.file) return sendError(res, 'No file uploaded', 400);
    const { originalname, filename, path: filePath, size, mimetype } = req.file;
    const logType = detectLogType(originalname);

    // #003 — operator-set classification (single-select each)
    const VALID_TIME = ['day', 'night'];
    const VALID_TYPE = ['surveillance', 'drop', 'obstacle', 'navigation', 'fpv', 'maintenance_test'];
    const timeClass = VALID_TIME.includes(req.body.timeClass) ? req.body.timeClass : null;
    const typeClass = VALID_TYPE.includes(req.body.typeClass) ? req.body.typeClass : null;

    // #003 — Real Ops is commander-gated. Only super_admin may set it true.
    const isRealOps = req.user.role === 'super_admin' && req.body.isRealOps === true;

    // #009 — airframe reference. Frontend sends 'drone'; accept 'droneId'
    // too for resilience. Stored as-is; existence not hard-required here
    // (legacy/missing allowed → null), but validate ObjectId shape.
    const droneRaw = req.body.drone || req.body.droneId || null;
    let droneId = null;
    if (droneRaw) {
      const Drone = require('../models/Drone');
      const d = await Drone.findById(droneRaw).select('_id');
      if (d) droneId = d._id;
      // If an invalid drone id is sent, we don't hard-fail the upload —
      // we just store null. Frontend dropdown is the guard. (Logged.)
      else logger.warn(`Upload: drone id ${droneRaw} not found; storing null`);
    }

    // #010 — drop score. Only meaningful for typeClass === 'drop'. For any
    // other type, force null regardless of what was submitted. For drop,
    // validate the value (reject out-of-set with 400).
    let dropScore = null;
    if (typeClass === 'drop') {
      const ds = parseDropScore(req.body.dropScore);
      if (!ds.ok) {
        try { fs.unlinkSync(filePath); } catch (_) {}
        return sendError(
          res,
          'dropScore must be one of 0, 10, 25, 50, 75, or null',
          400,
          { code: 'invalid_drop_score' }
        );
      }
      dropScore = ds.value;
    }
    // typeClass !== 'drop' → dropScore stays null (silently discarded).

    // #002 — mission is OPTIONAL and operator-selected (existing only).
    // Accept 'mission' (frontend) or 'missionId'.
    let missionId = null;
    const missionRaw = req.body.mission || req.body.missionId || null;
    if (missionRaw) {
      const m = await Mission.findById(missionRaw).select('_id');
      if (m) missionId = m._id;
    }

    // Commander attribution path (#003 commander authority).
    let ownerId = req.user._id;
    if (req.user.role === 'super_admin' && req.body.assignToOperatorUserId) {
      const target = await User.findById(req.body.assignToOperatorUserId).select('_id role');
      if (!target) {
        try { fs.unlinkSync(filePath); } catch (_) {}
        return sendError(
          res,
          'assignToOperatorUserId references a user that does not exist',
          400,
          { code: 'invalid_assignee' }
        );
      }
      if (target.role !== 'operator') {
        try { fs.unlinkSync(filePath); } catch (_) {}
        return sendError(
          res,
          'assignToOperatorUserId must reference a user with role=operator',
          400,
          { code: 'invalid_assignee_role' }
        );
      }
      ownerId = target._id;
    }

    // Create the FlightLog FIRST so we have an _id for the R2 key.
    const flightLog = await FlightLog.create({
      owner: ownerId,
      drone: droneId,            // #009
      originalName: originalname,
      storedName: filename,
      filePath,
      fileSize: size,
      mimeType: mimetype,
      logType,
      timeClass,
      typeClass,
      isRealOps,
      dropScore,                 // #010
      mission: missionId,
      parseStatus: 'pending',
    });

    // #005 — PUT to R2. R2 is the canonical store.
    const key = buildR2Key(flightLog._id.toString(), filename);
    try {
      await putObject({ key, filePath, contentType: mimetype });
      flightLog.r2Key = key;
      await flightLog.save({ validateBeforeSave: false });
    } catch (r2Err) {
      logger.error(`R2 PUT failed for log ${flightLog._id}: ${r2Err.message}`);
      await FlightLog.deleteOne({ _id: flightLog._id }).catch(() => {});
      try { fs.unlinkSync(filePath); } catch (_) {}
      return sendError(res, 'Storage upload failed. Please try again.', 502);
    }

    try { fs.unlinkSync(filePath); } catch (e) {
      logger.warn(`Could not delete temp file ${filePath}: ${e.message}`);
    }

    const attributedTo = String(ownerId) !== String(req.user._id)
      ? ` (attributed by ${req.user._id} to operator ${ownerId})`
      : '';
    logger.info(
      `Log uploaded: ${originalname} (${logType}) → R2 ${key} ` +
      `by ${req.user._id}${attributedTo} ` +
      `[time=${timeClass} type=${typeClass} realOps=${isRealOps} drone=${droneId} drop=${dropScore}]`
    );

    spawnParser(flightLog._id).catch((err) =>
      logger.error(`Parser spawn failed for log ${flightLog._id}: ${err.message}`)
    );

    return sendCreated(res, { flightLog }, 'Log uploaded. Parsing started in background.');
  } catch (error) { next(error); }
};

exports.getLogs = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, logType, parseStatus, owner } = req.query;
    const filter = { ...buildScopeFilter(req.user) };
    if (logType) filter.logType = logType;
    if (parseStatus) filter.parseStatus = parseStatus;

    if (owner && req.user.role === 'super_admin') {
      filter.owner = owner;
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [logs, total] = await Promise.all([
      FlightLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit))
        .populate('mission', 'name status missionType')
        // #009 — list rows may show drone class; project light fields.
        .populate('drone', 'name model frameType')
        .populate('parsedData', 'summary anomalyScore parserMeta.firmwareVersion parserMeta.autopilotType'),
      FlightLog.countDocuments(filter),
    ]);

    return sendSuccess(res, { logs }, 'Flight logs fetched', 200, {
      total, page: Number(page), pages: Math.ceil(total / Number(limit)),
    });
  } catch (error) { next(error); }
};

exports.getLog = async (req, res, next) => {
  try {
    const filter = { _id: req.params.id, ...buildScopeFilter(req.user) };
    const log = await FlightLog.findOne(filter)
      .populate('mission')
      .populate('drone', 'name model manufacturer frameType')
      .populate('parsedData');
    if (!log) return sendNotFound(res, 'Flight log');
    return sendSuccess(res, { flightLog: log });
  } catch (error) { next(error); }
};

exports.reparseLog = async (req, res, next) => {
  try {
    const filter = { _id: req.params.id, ...buildScopeFilter(req.user) };
    const log = await FlightLog.findOne(filter);
    if (!log) return sendNotFound(res, 'Flight log');

    log.parseStatus = 'pending';
    log.parseError = undefined;
    log.parseStartedAt = null;
    log.parseCompletedAt = null;
    log.progressAppliedAt = null;
    await log.save();

    spawnParser(log._id).catch((err) =>
      logger.error(`Reparse spawn failed for log ${log._id}: ${err.message}`)
    );

    return sendSuccess(res, { flightLog: log }, 'Reparse queued');
  } catch (error) { next(error); }
};

exports.deleteLog = async (req, res, next) => {
  try {
    const filter = { _id: req.params.id, ...buildScopeFilter(req.user) };
    const log = await FlightLog.findOneAndDelete(filter);
    if (!log) return sendNotFound(res, 'Flight log');

    if (log.r2Key) {
      try {
        const { deleteObject } = require('../config/r2');
        await deleteObject(log.r2Key);
      } catch (r2Err) {
        logger.warn(`R2 DELETE failed for ${log.r2Key}: ${r2Err.message}`);
      }
    }

    return sendSuccess(res, null, 'Flight log deleted');
  } catch (error) { next(error); }
};

/**
 * #010 — PATCH /api/flight-logs/:id/drop-score
 * super_admin only. Body: { dropScore: 0|10|25|50|75|null }.
 * Target log must be a drop sortie (typeClass === 'drop').
 */
exports.updateDropScore = async (req, res, next) => {
  try {
    if (req.user.role !== 'super_admin') {
      return sendError(res, 'Super admin only', 403, { code: 'forbidden' });
    }

    const ds = parseDropScore(req.body.dropScore);
    if (!ds.ok) {
      return sendError(
        res,
        'dropScore must be one of 0, 10, 25, 50, 75, or null',
        400,
        { code: 'invalid_drop_score' }
      );
    }

    const log = await FlightLog.findById(req.params.id).select('_id typeClass dropScore');
    if (!log) return sendNotFound(res, 'Flight log');

    if (log.typeClass !== 'drop') {
      return sendError(
        res,
        'Drop score can only be set on a drop sortie',
        400,
        { code: 'not_a_drop_sortie' }
      );
    }

    log.dropScore = ds.value;
    await log.save({ validateBeforeSave: false });

    return sendSuccess(res, { flightLog: log }, 'Drop score updated');
  } catch (error) { next(error); }
};