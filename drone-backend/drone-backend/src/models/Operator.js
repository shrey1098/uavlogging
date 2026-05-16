const mongoose = require('mongoose');

const operatorSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Can link to a User account, or be an independent record
    linkedUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    name: {
      type: String,
      required: [true, 'Operator name is required'],
      trim: true,
      maxlength: 150,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    licenseNumber: {
      type: String,
      trim: true,
    },
    licenseExpiry: {
      type: Date,
    },
    certifications: [
      {
        name: { type: String, trim: true },
        issuer: { type: String, trim: true },
        issuedAt: { type: Date },
        expiresAt: { type: Date },
        documentUrl: { type: String },
      },
    ],
    totalFlights: {
      type: Number,
      default: 0,
    },
    totalFlightTime: {
      type: Number, // seconds
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
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

operatorSchema.virtual('licenseValid').get(function () {
  if (!this.licenseExpiry) return null;
  return this.licenseExpiry > new Date();
});

operatorSchema.virtual('totalFlightTimeHours').get(function () {
  return parseFloat((this.totalFlightTime / 3600).toFixed(2));
});

operatorSchema.index({ owner: 1, isActive: 1 });

module.exports = mongoose.model('Operator', operatorSchema);
