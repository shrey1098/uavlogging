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

    // #002 — mission is OPTIONAL and operator-selected (existing only).
    let missionId = null;
    if (req.body.missionId) {
      const m = await Mission.findById(req.body.missionId).select('_id');
      if (m) missionId = m._id;
    }

    // Commander attribution path (#003 commander authority, broadened from
    // Real-Ops-only to any upload):
    //
    //   super_admin uploads can be attributed to any operator via
    //   `assignToOperatorUserId`. This applies whether or not isRealOps
    //   is set — the underlying authority (commander writes any
    //   operator's record) is the same; the Real-Ops flag is just one
    //   trigger among others, not the full scope of that authority.
    //
    //   Validation: target must exist AND have role 'operator'. Refuses
    //   attribution to another super_admin or any non-existent id. Bad
    //   ids fail closed (400), not silently fall through to uploader.
    //
    //   For non-super_admin callers the field is ignored entirely.
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
    // r2Key starts null; populated after PUT succeeds.
    const flightLog = await FlightLog.create({
      owner: ownerId,
      originalName: originalname,
      storedName: filename,
      filePath, // multer temp path — ephemeral, see model note
      fileSize: size,
      mimeType: mimetype,
      logType,
      timeClass,
      typeClass,
      isRealOps,
      mission: missionId,
      parseStatus: 'pending',
    });

    // #005 — PUT to R2. R2 is the canonical store. Multer's local file
    // is pre-PUT staging only; delete it on success or failure.
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

    // R2 is now the source of truth — delete multer's local file.
    try { fs.unlinkSync(filePath); } catch (e) {
      logger.warn(`Could not delete temp file ${filePath}: ${e.message}`);
    }

    // Log includes attribution intent for audit trail when commander
    // attributes a log to a different operator.
    const attributedTo = String(ownerId) !== String(req.user._id)
      ? ` (attributed by ${req.user._id} to operator ${ownerId})`
      : '';
    logger.info(
      `Log uploaded: ${originalname} (${logType}) → R2 ${key} ` +
      `by ${req.user._id}${attributedTo} ` +
      `[time=${timeClass} type=${typeClass} realOps=${isRealOps}]`
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

    // super_admin may scope the list to a specific operator via ?owner=.
    // For non-super_admin callers the param is ignored (buildScopeFilter
    // already pins owner to their own _id and we don't let them override).
    if (owner && req.user.role === 'super_admin') {
      filter.owner = owner;
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [logs, total] = await Promise.all([
      FlightLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit))
        .populate('mission', 'name status missionType')
        // #007 — list view consumes summary + anomalyScore. Project only
        // those; telemetry/events/alerts/flightPath are heavy and not
        // needed in a list, so excluded explicitly.
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
    const log = await FlightLog.findOne(filter).populate('mission').populate('parsedData');
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
    // Reset reconciler marker so the new parse run gets counted.
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

    // #005 — clean R2 in sync with DB. Best-effort: a 404 on R2 (already
    // gone) shouldn't fail the delete response.
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
