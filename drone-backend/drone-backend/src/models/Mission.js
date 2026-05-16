const mongoose = require('mongoose');

const waypointSchema = new mongoose.Schema(
  {
    seq: { type: Number },
    lat: { type: Number },
    lng: { type: Number },
    alt: { type: Number }, // metres (relative or AMSL)
    altFrame: { type: String, enum: ['relative', 'amsl', 'agl'], default: 'relative' },
    command: { type: String },
    speed: { type: Number }, // m/s
  },
  { _id: false }
);

const missionSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    drone: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Drone',
    },
    operator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Operator',
    },
    batteries: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Battery',
      },
    ],
    // Mission identity
    name: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    missionType: {
      type: String,
      enum: [
        'survey',
        'inspection',
        'mapping',
        'delivery',
        'photography',
        'videography',
        'search_rescue',
        'training',
        'test_flight',
        'fpv',
        'other',
      ],
      default: 'other',
    },
    status: {
      type: String,
      enum: ['draft', 'pending_verification', 'verified', 'archived'],
      default: 'draft',
      index: true,
    },
    // Location
    location: {
      name: { type: String },
      country: { type: String },
      region: { type: String },
      coordinates: {
        type: {
          type: String,
          enum: ['Point'],
          default: 'Point',
        },
        coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
      },
    },
    // Timing
    plannedStart: { type: Date },
    plannedEnd: { type: Date },
    actualStart: { type: Date },
    actualEnd: { type: Date },
    // Flight stats (populated by parser)
    flightDuration: { type: Number },    // seconds
    maxAltitude: { type: Number },       // metres
    maxSpeed: { type: Number },          // m/s
    totalDistance: { type: Number },     // metres
    maxWindSpeed: { type: Number },      // m/s
    // Conditions
    conditions: {
      weather: {
        type: String,
        enum: ['clear', 'cloudy', 'overcast', 'light_rain', 'strong_wind', 'other'],
      },
      temperatureCelsius: { type: Number },
      windSpeedMs: { type: Number },
      windDirection: { type: String },
      visibility: { type: String },
    },
    // Regulatory
    airspaceClass: { type: String },
    pilotInCommand: { type: String },
    flightPurpose: { type: String, maxlength: 500 },
    // Waypoints / route
    waypoints: [waypointSchema],
    // Notes & tags
    notes: { type: String, maxlength: 5000 },
    tags: [{ type: String, trim: true }],
    // Linked log
    flightLog: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FlightLog',
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

missionSchema.index({ 'location.coordinates': '2dsphere' });
missionSchema.index({ owner: 1, status: 1 });
missionSchema.index({ owner: 1, missionType: 1 });
missionSchema.index({ drone: 1 });
missionSchema.index({ operator: 1 });

missionSchema.virtual('flightDurationMinutes').get(function () {
  if (!this.flightDuration) return null;
  return parseFloat((this.flightDuration / 60).toFixed(2));
});

module.exports = mongoose.model('Mission', missionSchema);
