const mongoose = require('mongoose');

/**
 * ParsedFlightData — structured, queryable flight data extracted by the Python parser.
 * Designed for time-series telemetry, events, alerts and summary statistics.
 */

// ── Reusable sub-schemas ──────────────────────────────────────────────────────

const telemetrySampleSchema = new mongoose.Schema(
  {
    t: { type: Number, required: true },  // seconds since log start (float)
    lat: { type: Number },
    lng: { type: Number },
    alt: { type: Number },                // metres (relative)
    altAmsl: { type: Number },            // metres (AMSL)
    roll: { type: Number },               // degrees
    pitch: { type: Number },
    yaw: { type: Number },
    vx: { type: Number },                 // m/s
    vy: { type: Number },
    vz: { type: Number },
    groundSpeed: { type: Number },
    airspeed: { type: Number },
    heading: { type: Number },
    // Power
    voltage: { type: Number },            // V
    current: { type: Number },            // A
    batteryRemaining: { type: Number },   // %
    // RC
    ch1: { type: Number },
    ch2: { type: Number },
    ch3: { type: Number },
    ch4: { type: Number },
    // Environment
    windSpeed: { type: Number },
    windDirection: { type: Number },
    // Mode
    flightMode: { type: String },
    armed: { type: Boolean },
  },
  { _id: false }
);

const flightEventSchema = new mongoose.Schema(
  {
    t: { type: Number },           // seconds since log start
    timestamp: { type: Date },
    type: {
      type: String,
      enum: [
        'arm', 'disarm', 'takeoff', 'land', 'mode_change',
        'failsafe', 'rtl', 'fence_breach', 'ekf_error',
        'battery_low', 'battery_critical', 'gps_loss',
        'motor_failure', 'crash_detected', 'parachute_deploy',
        'waypoint_reached', 'mission_start', 'mission_end', 'other',
      ],
    },
    severity: {
      type: String,
      enum: ['info', 'warning', 'critical'],
      default: 'info',
    },
    description: { type: String },
    data: { type: mongoose.Schema.Types.Mixed }, // flexible payload
  },
  { _id: false }
);

const alertSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        'high_vibration', 'voltage_sag', 'temperature_warning',
        'gps_glitch', 'ekf_variance', 'attitude_deviation',
        'wind_shear', 'battery_imbalance', 'compass_interference',
        'motor_imbalance', 'other',
      ],
    },
    severity: {
      type: String,
      enum: ['info', 'warning', 'critical'],
    },
    tStart: { type: Number },
    tEnd: { type: Number },
    peakValue: { type: Number },
    threshold: { type: Number },
    description: { type: String },
  },
  { _id: false }
);

// ── Main schema ───────────────────────────────────────────────────────────────

const parsedFlightDataSchema = new mongoose.Schema(
  {
    flightLog: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FlightLog',
      required: true,
      unique: true,
      index: true,
    },
    mission: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Mission',
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // ── Summary Statistics ────────────────────────────────────────────────────
    summary: {
      startTime: { type: Date },
      endTime: { type: Date },
      durationSeconds: { type: Number },

      maxAltitude: { type: Number },
      minAltitude: { type: Number },
      avgAltitude: { type: Number },

      maxGroundSpeed: { type: Number },
      avgGroundSpeed: { type: Number },

      maxAirspeed: { type: Number },

      totalDistance: { type: Number },         // metres

      maxRoll: { type: Number },
      maxPitch: { type: Number },

      // Power
      maxVoltage: { type: Number },
      minVoltage: { type: Number },
      avgVoltage: { type: Number },
      maxCurrent: { type: Number },
      avgCurrent: { type: Number },
      totalMahUsed: { type: Number },

      // GPS
      maxSatellites: { type: Number },
      avgSatellites: { type: Number },
      minHdop: { type: Number },
      maxHdop: { type: Number },

      // Vibration
      maxVibrationX: { type: Number },
      maxVibrationY: { type: Number },
      maxVibrationZ: { type: Number },

      // Temperature
      maxMotorTemp: { type: Number },
      maxEscTemp: { type: Number },

      // Home point
      homeLat: { type: Number },
      homeLng: { type: Number },
      homeAlt: { type: Number },
    },

    // ── Telemetry (downsampled for web — full data stays in file) ─────────────
    telemetry: [telemetrySampleSchema],
    telemetrySampleRate: {
      type: Number, // Hz — how frequently samples are stored here
      default: 1,
    },
    totalRawSamples: {
      type: Number, // original sample count before downsampling
    },

    // ── Flight Path (GeoJSON LineString) ─────────────────────────────────────
    flightPath: {
      type: {
        type: String,
        enum: ['LineString'],
        default: 'LineString',
      },
      coordinates: {
        type: [[Number]], // [lng, lat, alt]
        default: [],
      },
    },

    // ── Events & Alerts ───────────────────────────────────────────────────────
    events: [flightEventSchema],
    alerts: [alertSchema],

    // ── Flight Modes Timeline ─────────────────────────────────────────────────
    flightModes: [
      {
        mode: { type: String },
        tStart: { type: Number },
        tEnd: { type: Number },
        durationSeconds: { type: Number },
        _id: false,
      },
    ],

    // ── Raw parser metadata ───────────────────────────────────────────────────
    parserMeta: {
      parserVersion: { type: String },
      logFormat: { type: String },
      firmwareVersion: { type: String },
      hardwareId: { type: String },
      autopilotType: { type: String },
      vehicleType: { type: String },
      parametersHash: { type: String }, // hash of vehicle params for quick comparison
    },

    // ── Anomaly score (0-100, computed post-parse) ────────────────────────────
    anomalyScore: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

parsedFlightDataSchema.index({ 'flightPath': '2dsphere' });
parsedFlightDataSchema.index({ owner: 1 });
parsedFlightDataSchema.index({ mission: 1 });

parsedFlightDataSchema.virtual('durationMinutes').get(function () {
  if (!this.summary?.durationSeconds) return null;
  return parseFloat((this.summary.durationSeconds / 60).toFixed(2));
});

module.exports = mongoose.model('ParsedFlightData', parsedFlightDataSchema);
