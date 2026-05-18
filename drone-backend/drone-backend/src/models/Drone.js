const mongoose = require('mongoose');

const droneSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Drone name is required'],
      trim: true,
      maxlength: 100,
    },
    serialNumber: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    manufacturer: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    model: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    // #001 — frameType enum extended with trg, fpv_quadcopter
    frameType: {
      type: String,
      enum: [
        'quadcopter',
        'hexacopter',
        'octocopter',
        'fixed_wing',
        'vtol',
        'tricopter',
        'fpv_quadcopter',
        'trg',
        'other',
      ],
      default: 'quadcopter',
    },
    flightController: {
      type: String,
      trim: true,
    },
    // #001 — new field: propeller size, freetext (e.g. "10 inch")
    propSize: {
      type: String,
      trim: true,
      default: null,
    },
    // #001 — new field: night capability. Default literal "Nil"
    nightCapability: {
      type: String,
      trim: true,
      default: 'Nil',
    },
    // #001 — new field: range in kilometres
    range: {
      type: Number, // kilometres
      min: 0,
      default: null,
    },
    // #001 — new field: EW compliance. Default literal "Nil"
    ewCompliance: {
      type: String,
      trim: true,
      default: 'Nil',
    },
    // #001 — new field: freetext remarks
    remarks: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: null,
    },
    registrationNumber: {
      type: String,
      trim: true,
    },
    maxTakeoffWeight: {
      type: Number, // grams
      min: 0,
    },
    // #001 — payloadCapacity unit changed: grams -> KILOGRAMS (breaking)
    payloadCapacity: {
      type: Number, // kilograms
      min: 0,
      default: null,
    },
    totalFlightTime: {
      type: Number, // seconds
      default: 0,
    },
    totalFlights: {
      type: Number,
      default: 0,
    },
    notes: {
      type: String,
      maxlength: 2000,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    tags: [{ type: String, trim: true }],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

droneSchema.virtual('totalFlightTimeHours').get(function () {
  return parseFloat((this.totalFlightTime / 3600).toFixed(2));
});

droneSchema.index({ owner: 1, isActive: 1 });
droneSchema.index({ serialNumber: 1 });

module.exports = mongoose.model('Drone', droneSchema);
