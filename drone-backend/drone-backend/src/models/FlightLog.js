const mongoose = require('mongoose');

const flightLogSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    mission: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Mission',
      default: null,
    },
    // #009 — airframe reference. Nullable: legacy logs (pre-#009) have
    // none. Set at upload from req.body.drone / droneId. Drives the
    // drone-class training analytics aggregation.
    drone: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Drone',
      default: null,
      index: true,
    },
    originalName: {
      type: String,
      required: true,
    },
    storedName: {
      type: String,
    },
    filePath: {
      type: String,
    },
    // #005 — canonical R2 object reference.
    r2Key: {
      type: String,
      default: null,
      index: true,
    },
    fileSize: {
      type: Number,
    },
    mimeType: {
      type: String,
    },
    logType: {
      type: String,
      enum: ['ardupilot_bin', 'ardupilot_tlog', 'px4_ulg', 'csv', 'kml', 'skydroid', 'unknown'],
      default: 'unknown',
      index: true,
    },
    // ── #003 — Gamification classification ──────────────────────────────
    timeClass: {
      type: String,
      enum: ['day', 'night'],
      default: null,
    },
    typeClass: {
      type: String,
      enum: ['surveillance', 'drop', 'obstacle', 'navigation', 'fpv', 'maintenance_test'],
      default: null,
    },
    isRealOps: {
      type: Boolean,
      default: false,
    },
    // #010 — Drop score. Human-assessed accuracy for drop sorties only.
    // Allowed values 0|10|25|50|75 (validated in controller). Null = not
    // scored (valid + common). MUST be null when typeClass !== 'drop';
    // controller enforces that invariant.
    dropScore: {
      type: Number,
      default: null,
    },
    parseStatus: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', 'skipped'],
      default: 'pending',
      index: true,
    },
    parseStartedAt: { type: Date },
    parseCompletedAt: { type: Date },
    parseError: {
      message: { type: String },
      stack: { type: String },
      code: { type: String },
    },
    parserVersion: { type: String },
    parsedData: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ParsedFlightData',
      default: null,
    },
    progressAppliedAt: {
      type: Date,
      default: null,
      index: true,
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
    checksum: {
      type: String,
    },
    notes: {
      type: String,
      maxlength: 1000,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

flightLogSchema.index({ owner: 1, parseStatus: 1 });
flightLogSchema.index({ owner: 1, logType: 1 });
flightLogSchema.index({ checksum: 1 });
flightLogSchema.index({ parseStatus: 1, progressAppliedAt: 1 });
// #009 — analytics aggregation walks completed logs by drone.
flightLogSchema.index({ drone: 1, parseStatus: 1 });

flightLogSchema.virtual('fileSizeMB').get(function () {
  if (!this.fileSize) return null;
  return parseFloat((this.fileSize / (1024 * 1024)).toFixed(2));
});

flightLogSchema.virtual('parseDurationMs').get(function () {
  if (!this.parseStartedAt || !this.parseCompletedAt) return null;
  return this.parseCompletedAt.getTime() - this.parseStartedAt.getTime();
});

module.exports = mongoose.model('FlightLog', flightLogSchema);