/**
 * Readiness service — DECISIONS #003
 *
 * Computes a 0–100 readiness score per operator from real flight data.
 * Component set + weights are BINDING (from the decision). All other
 * numbers here are TUNABLE constants — adjustable as Notion-tracked minor
 * changes without a new decision entry.
 *
 * | Component       | Weight | Definition                                          |
 * |-----------------|--------|-----------------------------------------------------|
 * | Flight Quality  | 40     | 100 − avg(anomalyScore) across operator's flights   |
 * | Currency        | 25     | Full if flown < 14d ago; linear decay to 0 by 60d   |
 * | Experience      | 20     | Log-scaled accumulated flight hours; plateaus ~100h |
 * | Volume          | 10     | Log-scaled total sortie count; plateaus             |
 * | Live Ops        | 5      | Non-zero if operator has any Real Ops flights       |
 */

const ParsedFlightData = require('../models/ParsedFlightData');
const FlightLog = require('../models/FlightLog');
const { OperatorProgress } = require('../models/OperatorProgress');

// ── BINDING weights (from #003 — do not change without a new entry) ──────
const WEIGHTS = {
  flightQuality: 40,
  currency: 25,
  experience: 20,
  volume: 10,
  liveOps: 5,
};

// ── TUNABLE constants (Notion-tracked minor changes) ─────────────────────
const TUNING = {
  currencyFullDays: 14, // full marks if last flight within this many days
  currencyZeroDays: 60, // decays linearly to zero by this many days
  experiencePlateauHours: 100, // diminishing returns past ~this
  volumePlateauSorties: 200, // diminishing returns past ~this
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Flight Quality — 100 − avg(anomalyScore) over the operator's COUNTED
 * flights. maintenance_test flights are excluded (they are not skill data).
 */
const computeFlightQuality = async (ownerId) => {
  // Find counted (non-maintenance_test) completed logs for this operator
  const logs = await FlightLog.find({
    owner: ownerId,
    parseStatus: 'completed',
    typeClass: { $ne: 'maintenance_test' },
  }).select('parsedData').lean();

  if (!logs.length) return { score: 0, sampleSize: 0 };

  const parsedIds = logs.map((l) => l.parsedData).filter(Boolean);
  if (!parsedIds.length) return { score: 0, sampleSize: 0 };

  const parsed = await ParsedFlightData.find({ _id: { $in: parsedIds } })
    .select('anomalyScore')
    .lean();

  const scores = parsed
    .map((p) => p.anomalyScore)
    .filter((s) => typeof s === 'number');

  if (!scores.length) return { score: 0, sampleSize: 0 };

  const avgAnomaly = scores.reduce((a, b) => a + b, 0) / scores.length;
  return { score: clamp(100 - avgAnomaly, 0, 100), sampleSize: scores.length };
};

/**
 * Currency — full marks if last counted flight within currencyFullDays,
 * linear decay to 0 by currencyZeroDays. No flights → 0.
 */
const computeCurrency = (lastFlightAt) => {
  if (!lastFlightAt) return 0;
  const daysSince = (Date.now() - new Date(lastFlightAt).getTime()) / 86400000;
  if (daysSince <= TUNING.currencyFullDays) return 100;
  if (daysSince >= TUNING.currencyZeroDays) return 0;
  const span = TUNING.currencyZeroDays - TUNING.currencyFullDays;
  const decayed = 1 - (daysSince - TUNING.currencyFullDays) / span;
  return clamp(decayed * 100, 0, 100);
};

/**
 * Experience — log-scaled accumulated flight hours, plateauing.
 * 0h → 0, ~plateau hours → ~100, asymptotic past that.
 */
const computeExperience = (countedFlightSeconds) => {
  const hours = (countedFlightSeconds || 0) / 3600;
  if (hours <= 0) return 0;
  // log curve normalised so plateauHours maps to ~90
  const v = (Math.log10(hours + 1) / Math.log10(TUNING.experiencePlateauHours + 1)) * 90;
  return clamp(v, 0, 100);
};

/**
 * Volume — log-scaled counted sortie count, plateauing.
 */
const computeVolume = (countedSorties) => {
  const n = countedSorties || 0;
  if (n <= 0) return 0;
  const v = (Math.log10(n + 1) / Math.log10(TUNING.volumePlateauSorties + 1)) * 90;
  return clamp(v, 0, 100);
};

/**
 * Live Ops — binary-ish: non-zero if any Real Ops flights on record.
 * Scaled mildly by count so it isn't purely 0/full.
 */
const computeLiveOps = (realOpsCount) => {
  if (!realOpsCount || realOpsCount <= 0) return 0;
  // 1 real op → 60, scales up, caps at 100 by ~10 real ops
  return clamp(50 + Math.log10(realOpsCount + 1) * 50, 0, 100);
};

/**
 * Compute full readiness for one operator.
 * Returns the 0–100 weighted score, component breakdown, and the
 * underlying OperatorProgress doc (so callers don't need to re-fetch).
 */
const computeReadiness = async (ownerId) => {
  // OperatorProgress lookup and Flight Quality computation are
  // independent — fire them in parallel. (Previously sequential —
  // halves the round-trip count per operator.)
  const [progressDoc, fq] = await Promise.all([
    OperatorProgress.findOne({ owner: ownerId }),
    computeFlightQuality(ownerId),
  ]);

  const progress = progressDoc || {
    // Synthetic empty progress — operator has flown nothing counted
    lastFlightAt: null,
    countedFlightSeconds: 0,
    countedSorties: 0,
    realOpsCount: 0,
  };

  const components = {
    flightQuality: Math.round(fq.score),
    currency: Math.round(computeCurrency(progress.lastFlightAt)),
    experience: Math.round(computeExperience(progress.countedFlightSeconds)),
    volume: Math.round(computeVolume(progress.countedSorties)),
    liveOps: Math.round(computeLiveOps(progress.realOpsCount)),
  };

  const weighted =
    (components.flightQuality * WEIGHTS.flightQuality +
      components.currency * WEIGHTS.currency +
      components.experience * WEIGHTS.experience +
      components.volume * WEIGHTS.volume +
      components.liveOps * WEIGHTS.liveOps) /
    100;

  return {
    score: Math.round(clamp(weighted, 0, 100)),
    components,
    weights: WEIGHTS,
    meta: {
      flightQualitySampleSize: fq.sampleSize,
      lastFlightAt: progress.lastFlightAt,
      countedSorties: progress.countedSorties,
      countedFlightHours: parseFloat(((progress.countedFlightSeconds || 0) / 3600).toFixed(1)),
      realOpsCount: progress.realOpsCount,
    },
    // The actual OperatorProgress document (or null if absent). Exposed
    // so list/detail controllers don't have to re-fetch it for badges.
    progressDoc: progressDoc || null,
  };
};

module.exports = { computeReadiness, WEIGHTS, TUNING };
