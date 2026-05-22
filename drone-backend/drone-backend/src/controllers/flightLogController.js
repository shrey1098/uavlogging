const path = require('path');
const FlightLog = require('../models/FlightLog');
const Mission = require('../models/Mission');
const { detectLogType } = require('../config/upload');
const { sendSuccess, sendCreated, sendNotFound, sendError } = require('../utils/response');
const logger = require('../config/logger');
const { spawnParser } = require('../workers/parserWorker');
const { buildScopeFilter } = require('./scopeFilter');

exports.uploadLog = async (req, res, next) => {
  try {
    console.log('UPLOAD DEBUG:', { file: req.file, bodyKeys: Object.keys(req.body) });
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
    // No auto-create. Accept a missionId if provided and valid.
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

    const flightLog = await FlightLog.create({
      owner: ownerId,
      originalName: originalname,
      storedName: filename,
      filePath,
      fileSize: size,
      mimeType: mimetype,
      logType,
      timeClass,
      typeClass,
      isRealOps,
      mission: missionId,
      parseStatus: 'pending',
    });

    logger.info(
      `Log uploaded: ${originalname} (${logType}) by ${req.user._id} ` +
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
    return sendSuccess(res, null, 'Flight log deleted');
  } catch (error) { next(error); }
};
