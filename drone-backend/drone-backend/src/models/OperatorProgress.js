const mongoose = require('mongoose');

/**
 * OperatorProgress — #003
 * One document per operator (keyed by owner = User._id of the operator).
 * Holds per-category sortie counters. Tiers are DERIVED from counts via
 * virtuals, never stored, so the ladder can be retuned without migration.
 *
 * Counter rules (per DECISIONS #003):
 *  - A counted sortie does +1 to its Time category AND +1 to its Type category.
 *  - typeClass 'maintenance_test' increments NOTHING (excluded entirely).
 *  - realOps increments only via the commander Real-Ops upload path.
 */

// Uniform tier thresholds for all Time + Type categories (Tier 1 → Tier 10)
const TIER_THRESHOLDS = [5, 10, 20, 35, 60, 100, 150, 225, 325, 500];

// Real Ops ladder — 5 tiers
const REAL_OPS_THRESHOLDS = [1, 3, 7, 15, 30];

const tierFromCount = (count, thresholds) => {
  let tier = 0;
  for (let i = 0; i < thresholds.length; i++) {
    if (count >= thresholds[i]) tier = i + 1;
    else break;
  }
  return tier;
};

const operatorProgressSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },

    // ── Time axis counters ───────────────────────────────────────────────
    timeCounts: {
      day: { type: Number, default: 0, min: 0 },
      night: { type: Number, default: 0, min: 0 },
    },

    // ── Type axis counters (maintenance_test intentionally absent) ───────
    typeCounts: {
      surveillance: { type: Number, default: 0, min: 0 },
      drop: { type: Number, default: 0, min: 0 },
      obstacle: { type: Number, default: 0, min: 0 },
      navigation: { type: Number, default: 0, min: 0 },
      fpv: { type: Number, default: 0, min: 0 },
    },

    // ── Real Ops counter (commander-gated) ───────────────────────────────
    realOpsCount: { type: Number, default: 0, min: 0 },

    // ── Volume/Experience inputs for readiness (#003) ────────────────────
    // countedSorties excludes maintenance_test. flightSeconds likewise.
    countedSorties: { type: Number, default: 0, min: 0 },
    countedFlightSeconds: { type: Number, default: 0, min: 0 },

    // Last counted flight timestamp — drives Currency component
    lastFlightAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Derived tier virtuals (highest earned tier per category) ────────────
operatorProgressSchema.virtual('timeTiers').get(function () {
  return {
    day: tierFromCount(this.timeCounts.day, TIER_THRESHOLDS),
    night: tierFromCount(this.timeCounts.night, TIER_THRESHOLDS),
  };
});

operatorProgressSchema.virtual('typeTiers').get(function () {
  return {
    surveillance: tierFromCount(this.typeCounts.surveillance, TIER_THRESHOLDS),
    drop: tierFromCount(this.typeCounts.drop, TIER_THRESHOLDS),
    obstacle: tierFromCount(this.typeCounts.obstacle, TIER_THRESHOLDS),
    navigation: tierFromCount(this.typeCounts.navigation, TIER_THRESHOLDS),
    fpv: tierFromCount(this.typeCounts.fpv, TIER_THRESHOLDS),
  };
});

operatorProgressSchema.virtual('realOpsTier').get(function () {
  return tierFromCount(this.realOpsCount, REAL_OPS_THRESHOLDS);
});

const OperatorProgress = mongoose.model('OperatorProgress', operatorProgressSchema);

module.exports = {
  OperatorProgress,
  TIER_THRESHOLDS,
  REAL_OPS_THRESHOLDS,
  tierFromCount,
};
