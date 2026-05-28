/**
 * Readiness & achievements controller — DECISIONS #003
 *
 * Access (ties to #002):
 *  - operator   → own readiness/badges only
 *  - super_admin→ any operator, or list-all
 */

const { computeReadiness } = require('../services/readinessService');
const { OperatorProgress, TIER_THRESHOLDS, REAL_OPS_THRESHOLDS } = require('../models/OperatorProgress');
const User = require('../models/User');
const Operator = require('../models/Operator');
const { sendSuccess, sendError, sendForbidden, sendNotFound } = require('../utils/response');

// Shape the highest-tier-only badge view (#003 display rule)
const buildBadges = (progress) => {
  if (!progress) {
    return {
      time: { day: 0, night: 0 },
      type: { surveillance: 0, drop: 0, obstacle: 0, navigation: 0, fpv: 0 },
      realOps: 0,
      thresholds: { category: TIER_THRESHOLDS, realOps: REAL_OPS_THRESHOLDS },
      counts: null,
    };
  }
  return {
    time: progress.timeTiers,
    type: progress.typeTiers,
    realOps: progress.realOpsTier,
    thresholds: { category: TIER_THRESHOLDS, realOps: REAL_OPS_THRESHOLDS },
    counts: {
      time: progress.timeCounts,
      type: progress.typeCounts,
      realOps: progress.realOpsCount,
    },
  };
};

// ── GET /api/readiness/me — operator's own ───────────────────────────────
exports.getMyReadiness = async (req, res, next) => {
  try {
    const readiness = await computeReadiness(req.user._id);
    return sendSuccess(res, {
      readiness,
      badges: buildBadges(readiness.progressDoc),
    });
  } catch (err) { next(err); }
};

// ── GET /api/readiness/:userId — super_admin: any operator ───────────────
exports.getReadinessFor = async (req, res, next) => {
  try {
    if (req.user.role !== 'super_admin' && String(req.user._id) !== req.params.userId) {
      return sendForbidden(res, 'Operators may only view their own readiness');
    }
    // Fire user lookup, readiness compute, and operator lookup in parallel —
    // none of them depend on each other.
    const [target, readiness, opDoc] = await Promise.all([
      User.findById(req.params.userId).select('name role'),
      computeReadiness(req.params.userId),
      Operator.findOne({ linkedUser: req.params.userId }).select('_id name').lean(),
    ]);
    if (!target) return sendNotFound(res, 'User');

    return sendSuccess(res, {
      user: { _id: target._id, name: target.name, role: target.role },
      operator: opDoc ? { _id: opDoc._id, name: opDoc.name } : null,
      readiness,
      badges: buildBadges(readiness.progressDoc),
    });
  } catch (err) { next(err); }
};

// ── GET /api/readiness — super_admin: all operators ──────────────────────
exports.listAllReadiness = async (req, res, next) => {
  try {
    if (req.user.role !== 'super_admin') {
      return sendForbidden(res, 'Super admin only');
    }

    // Operators list and Operator-doc lookups can run together.
    const [operators, opDocs] = await Promise.all([
      User.find({ role: 'operator' }).select('name email').lean(),
      // Fetch ALL operator docs in one query; map by linkedUser below.
      Operator.find({}).select('_id name linkedUser').lean(),
    ]);
    const opByUser = new Map(opDocs.map((d) => [String(d.linkedUser), d]));

    // Compute readiness for all operators IN PARALLEL.
    // Was: 26 sequential calls × ~4 DB round trips each = 104 serial trips
    // Now: 26 calls firing concurrently, ~2 round trips each (already
    // parallelised inside computeReadiness). End-to-end latency drops from
    // ~5-6s to roughly the slowest single operator's readiness compute.
    const rows = await Promise.all(operators.map(async (op) => {
      const readiness = await computeReadiness(op._id);
      const opDoc = opByUser.get(String(op._id)) || null;
      return {
        user: { _id: op._id, name: op.name, email: op.email },
        operator: opDoc ? { _id: opDoc._id, name: opDoc.name } : null,
        readinessScore: readiness.score,
        components: readiness.components,
        badges: buildBadges(readiness.progressDoc),
      };
    }));

    rows.sort((a, b) => b.readinessScore - a.readinessScore);
    return sendSuccess(res, { operators: rows }, 'Unit readiness', 200, { total: rows.length });
  } catch (err) { next(err); }
};
