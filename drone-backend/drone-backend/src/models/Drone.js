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
    frameType: {
      type: String,
      enum: ['quadcopter', 'hexacopter', 'octocopter', 'fixed_wing', 'vtol', 'tricopter', 'other'],
      default: 'quadcopter',
    },
    flightController: {
      type: String,
      enum: ['ardupilot', 'px4', 'dji', 'betaflight', 'other'],
      default: 'ardupilot',
    },
    // Regulatory / registration
    registrationNumber: {
      type: String,
      trim: true,
    },
    maxTakeoffWeight: {
      type: Number, // grams
      min: 0,
    },
    // Payload capacity
    payloadCapacity: {
      type: Number, // grams
      min: 0,
    },
    // Maintenance
    totalFlightTime: {
      type: Number, // seconds — accumulates across missions
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
