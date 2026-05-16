const mongoose = require('mongoose');

const batteryCycleSchema = new mongoose.Schema(
  {
    mission: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Mission',
    },
    cycleNumber: { type: Number },
    startVoltage: { type: Number }, // Volts
    endVoltage: { type: Number },
    lowestVoltage: { type: Number },
    startCapacity: { type: Number }, // mAh
    usedCapacity: { type: Number },  // mAh
    maxCurrent: { type: Number },    // Amps
    temperature: { type: Number },   // Celsius
    date: { type: Date, default: Date.now },
  },
  { _id: false }
);

const batterySchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Battery name is required'],
      trim: true,
      maxlength: 100,
    },
    serialNumber: {
      type: String,
      trim: true,
    },
    manufacturer: {
      type: String,
      trim: true,
    },
    chemistry: {
      type: String,
      enum: ['lipo', 'lion', 'lifepo4', 'nimh', 'other'],
      default: 'lipo',
    },
    cellCount: {
      type: Number,
      min: 1,
    },
    capacity: {
      type: Number, // mAh
      required: [true, 'Capacity (mAh) is required'],
      min: 0,
    },
    nominalVoltage: {
      type: Number, // Volts (derived: cellCount * 3.7 for LiPo, but user can override)
    },
    maxVoltage: {
      type: Number,
    },
    minVoltage: {
      type: Number,
    },
    maxCurrentRating: {
      type: Number, // C rating / Amps
    },
    // Lifecycle tracking
    cycleCount: {
      type: Number,
      default: 0,
    },
    maxCycles: {
      type: Number,
      default: 300,
    },
    totalFlightTime: {
      type: Number, // seconds
      default: 0,
    },
    purchaseDate: {
      type: Date,
    },
    retiredAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ['active', 'needs_inspection', 'retired', 'storage'],
      default: 'active',
    },
    cycles: [batteryCycleSchema],
    notes: {
      type: String,
      maxlength: 2000,
    },
    tags: [{ type: String, trim: true }],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

batterySchema.virtual('healthPercent').get(function () {
  if (!this.maxCycles || this.maxCycles === 0) return null;
  return Math.max(0, Math.round(((this.maxCycles - this.cycleCount) / this.maxCycles) * 100));
});

batterySchema.virtual('isRetired').get(function () {
  return this.status === 'retired' || this.cycleCount >= this.maxCycles;
});

batterySchema.index({ owner: 1, status: 1 });

module.exports = mongoose.model('Battery', batterySchema);
