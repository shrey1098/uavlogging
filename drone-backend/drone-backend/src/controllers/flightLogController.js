const fs = require('fs');
const path = require('path');
const FlightLog = require('../models/FlightLog');
const Mission = require('../models/Mission');
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

    // #003 — Real Ops upload path: super_admin may assign the log to a
    // specific operator. Otherwise owner is the uploader.
    let ownerId = req.user._id;
    if (isRealOps && req.body.assignToOperatorUserId) {
      ownerId = req.body.assignToOperatorUserId;
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
      // R2 PUT failed — clean up the half-created FlightLog and the
      // temp file. Surface a 502 so the client can retry.
      logger.error(`R2 PUT failed for log ${flightLog._id}: ${r2Err.message}`);
      await FlightLog.deleteOne({ _id: flightLog._id }).catch(() => {});
      try { fs.unlinkSync(filePath); } catch (_) {}
      return sendError(res, 'Storage upload failed. Please try again.', 502);
    }

    // R2 is now the source of truth — delete multer's local file.
    try { fs.unlinkSync(filePath); } catch (e) {
      logger.warn(`Could not delete temp file ${filePath}: ${e.message}`);
    }

    logger.info(
      `Log uploaded: ${originalname} (${logType}) → R2 ${key} ` +
      `by ${req.user._id} [time=${timeClass} type=${typeClass} realOps=${isRealOps}]`
    );

    spawnParser(flightLog._id).catch((err) =>
      logger.error(`Parser spawn failed for log ${flightLog._id}: ${err.message}`)
    );

    return sendCreated(res, { flightLog }, 'Log uploaded. Parsing started in background.');
  } catch (error) { next(error); }
};

exports.getLogs = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, logType, parseStatus } = req.query;
    const filter = { ...buildScopeFilter(req.user) };
    if (logType) filter.logType = logType;
    if (parseStatus) filter.parseStatus = parseStatus;

    const skip = (Number(page) - 1) * Number(limit);
    const [logs, total] = await Promise.all([
      FlightLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit))
        .populate('mission', 'name status missionType'),
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
    return sendSuccess(res, { log });
  } catch (error) { next(error); }
};

exports.reparseLog = async (req, res, next) => {
  try {
    const filter = { _id: req.params.id, ...buildScopeFilter(req.user) };
    const log = await FlightLog.findOne(filter);
    if (!log) return sendNotFound(res, 'Flight log');
    if (log.parseStatus === 'processing') return sendError(res, 'Log is already being processed', 409);

    log.parseStatus = 'pending';
    log.parseError = null;
    log.parseStartedAt = null;
    log.parseCompletedAt = null;
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
