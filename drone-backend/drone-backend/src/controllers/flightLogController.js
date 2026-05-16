const FlightLog = require('../models/FlightLog');
const Mission   = require('../models/Mission');
const { uploadToR2, deleteFromR2 } = require('../config/upload');
const { dispatchParseJob } = require('../workers/parserWorker');
const { sendSuccess, sendCreated, sendError, sendNotFound, sendForbidden } = require('../utils/response');
const logger = require('../config/logger');

// POST /api/flight-logs/upload

exports.uploadLog = async (req, res, next) => {
   console.log('FILES:', req.files);
  console.log('FILE:', req.file);
  console.log('BODY:', req.body);
  console.log('HEADERS:', req.headers['content-type']);
  try {
    if (!req.file) {
      return sendError(res, 'No file uploaded', 400);
    }

    const { missionId } = req.body;

    if (missionId) {
      const mission = await Mission.findById(missionId);
      if (!mission) return sendNotFound(res, 'Mission not found');
      if (mission.owner.toString() !== req.user._id.toString() && req.user.role !== 'super_admin') {
        return sendForbidden(res);
      }
    }

    const { storedName, key, fileUrl, logType } = await uploadToR2(req.file);

    const flightLog = await FlightLog.create({
      owner:        req.user._id,
      mission:      missionId || undefined,
      originalName: req.file.originalname,
      storedName,
      filePath:     key,
      fileUrl,
      fileSize:     req.file.size,
      logType,
      parseStatus:  'pending',
    });

    if (missionId) {
      await Mission.findByIdAndUpdate(missionId, { flightLog: flightLog._id });
    }

    dispatchParseJob(flightLog._id.toString(), fileUrl, logType)
      .catch(err => {
        logger.error(`[flightLogController] Parser dispatch failed for ${flightLog._id}: ${err.message}`);
        FlightLog.findByIdAndUpdate(flightLog._id, {
          parseStatus: 'failed',
          parseError: { message: err.message, code: 'DISPATCH_ERROR' },
        }).catch(() => {});
      });

    return sendCreated(res, 'Log uploaded, parsing started', { flightLog });

  } catch (err) {
    next(err);
  }
};

// POST /api/flight-logs/:id/reparse
exports.reparseLog = async (req, res, next) => {
  try {
    const flightLog = await FlightLog.findById(req.params.id);
    if (!flightLog) return sendNotFound(res, 'FlightLog not found');

    if (flightLog.owner.toString() !== req.user._id.toString() && req.user.role !== 'super_admin') {
      return sendForbidden(res);
    }

    if (flightLog.parseStatus === 'processing') {
      return sendError(res, 'Already processing', 409);
    }

    await FlightLog.findByIdAndUpdate(flightLog._id, {
      parseStatus: 'pending',
      parseError:  null,
      parsedData:  null,
    });

    dispatchParseJob(flightLog._id.toString(), flightLog.fileUrl, flightLog.logType)
      .catch(err => {
        logger.error(`[reparse] Dispatch failed: ${err.message}`);
        FlightLog.findByIdAndUpdate(flightLog._id, {
          parseStatus: 'failed',
          parseError: { message: err.message, code: 'DISPATCH_ERROR' },
        }).catch(() => {});
      });

    return sendSuccess(res, 'Reparse dispatched');

  } catch (err) {
    next(err);
  }
};

// GET /api/flight-logs
exports.getLogs = async (req, res, next) => {
  try {
    const filter = req.user.role === 'super_admin' ? {} : { owner: req.user._id };
    const logs = await FlightLog.find(filter).sort({ createdAt: -1 }).populate('mission', 'name missionType');
    return sendSuccess(res, 'Flight logs retrieved', { logs });
  } catch (err) {
    next(err);
  }
};

// GET /api/flight-logs/:id
exports.getLog = async (req, res, next) => {
  try {
    const log = await FlightLog.findById(req.params.id).populate('parsedData').populate('mission');
    if (!log) return sendNotFound(res, 'FlightLog not found');
    if (log.owner.toString() !== req.user._id.toString() && req.user.role !== 'super_admin') {
      return sendForbidden(res);
    }
    return sendSuccess(res, 'Flight log retrieved', { log });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/flight-logs/:id
exports.deleteLog = async (req, res, next) => {
  try {
    const log = await FlightLog.findById(req.params.id);
    if (!log) return sendNotFound(res, 'FlightLog not found');
    if (log.owner.toString() !== req.user._id.toString() && req.user.role !== 'super_admin') {
      return sendForbidden(res);
    }

    if (log.filePath) await deleteFromR2(log.filePath);

    await log.deleteOne();
    return sendSuccess(res, 'Flight log deleted');
  } catch (err) {
    next(err);
  }
};
