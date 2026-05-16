const mongoose = require('mongoose');

/**
 * FlightLog — represents the raw uploaded log file.
 * One FlightLog → one uploaded file → parsed into ParsedFlightData.
 */
const flightLogSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    mission: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Mission',
      default: null,
    },
    // File metadata
    originalName: {
      type: String,
      required: true,
    },
    storedName: {
      type: String,
      required: true, // UUID-based name on disk
    },
    filePath: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number, // bytes
    },
    mimeType: {
      type: String,
    },
    // Log type detection
    logType: {
      type: String,
      enum: ['ardupilot_bin', 'ardupilot_tlog', 'px4_ulg', 'csv', 'kml', 'skydroid', 'unknown'],
      default: 'unknown',
      index: true,
    },
    // Parse status
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
    // Parser version used
    parserVersion: { type: String },
    // Link to parsed data
    parsedData: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ParsedFlightData',
      default: null,
    },
    // Upload session info
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
    checksum: {
      type: String, // MD5 or SHA256 for dedup
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
flightLogSchema.index({ checksum: 1 }); // for duplicate detection

flightLogSchema.virtual('fileSizeMB').get(function () {
  if (!this.fileSize) return null;
  return parseFloat((this.fileSize / (1024 * 1024)).toFixed(2));
});

flightLogSchema.virtual('parseDurationMs').get(function () {
  if (!this.parseStartedAt || !this.parseCompletedAt) return null;
  return this.parseCompletedAt.getTime() - this.parseStartedAt.getTime();
});

module.exports = mongoose.model('FlightLog', flightLogSchema);
