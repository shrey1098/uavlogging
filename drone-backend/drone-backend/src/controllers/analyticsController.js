/**
 * Analytics controller — DECISIONS #009
 *
 * Drone-class training distribution for the commander.
 */

const FlightLog = require('../models/FlightLog');
const Drone = require('../models/Drone');
const ParsedFlightData = require('../models/ParsedFlightData');
const Operator = require('../models/Operator');
const { sendSuccess, sendError } = require('../utils/response');

/**
 * GET /api/analytics/drones/category-training
 * super_admin only.
 *
 * For each drone frameType present in the fleet's flown logs:
 *   - operatorCount   : distinct operators who flew that class
 *   - totalFlightHours: summed parsedData.summary.durationSeconds → hours
 *   - operators[]     : per-operator { userId, operatorId, name, sorties, flightHours }
 *
 * Counts only completed, non-maintenance_test logs that have a drone ref.
 */
exports.droneCategoryTraining = async (req, res, next) => {
  try {
    if (req.user.role !== 'super_admin') {
      return sendError(res, 'Super admin only', 403, { code: 'forbidden' });
    }

    // Derive collection names from the models so the $lookup stages can't
    // drift from Mongoose's actual pluralization.
    const dronesColl = Drone.collection.name;
    const parsedColl = ParsedFlightData.collection.name;

    const pipeline = [
      {
        $match: {
          parseStatus: 'completed',
          drone: { $ne: null },
          typeClass: { $ne: 'maintenance_test' },
        },
      },
      {
        $lookup: {
          from: dronesColl,
          localField: 'drone',
          foreignField: '_id',
          as: 'droneDoc',
        },
      },
      { $unwind: '$droneDoc' },
      {
        $lookup: {
          from: parsedColl,
          localField: 'parsedData',
          foreignField: '_id',
          as: 'parsed',
        },
      },
      {
        $addFields: {
          durationSeconds: {
            $ifNull: [{ $arrayElemAt: ['$parsed.summary.durationSeconds', 0] }, 0],
          },
        },
      },
      {
        $group: {
          _id: { frameType: '$droneDoc.frameType', owner: '$owner' },
          sorties: { $sum: 1 },
          flightSeconds: { $sum: '$durationSeconds' },
        },
      },
      {
        $group: {
          _id: '$_id.frameType',
          operatorCount: { $sum: 1 },
          totalFlightSeconds: { $sum: '$flightSeconds' },
          operators: {
            $push: {
              userId: '$_id.owner',
              sorties: '$sorties',
              flightSeconds: '$flightSeconds',
            },
          },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const grouped = await FlightLog.aggregate(pipeline);

    // Resolve operator names via Operator.linkedUser → User._id.
    const allUserIds = [];
    for (const cat of grouped) {
      for (const op of cat.operators) allUserIds.push(op.userId);
    }
    const opDocs = await Operator.find({ linkedUser: { $in: allUserIds } })
      .select('_id name linkedUser')
      .lean();
    const opByUser = new Map(opDocs.map((d) => [String(d.linkedUser), d]));

    const categories = grouped.map((cat) => ({
      frameType: cat._id,
      operatorCount: cat.operatorCount,
      totalFlightHours: parseFloat((cat.totalFlightSeconds / 3600).toFixed(1)),
      operators: cat.operators
        .map((op) => {
          const od = opByUser.get(String(op.userId)) || null;
          return {
            userId: op.userId,
            operatorId: od ? od._id : null,
            name: od ? od.name : 'Unknown',
            sorties: op.sorties,
            flightHours: parseFloat((op.flightSeconds / 3600).toFixed(1)),
          };
        })
        .sort((a, b) => b.flightHours - a.flightHours),
    }));

    return sendSuccess(res, { categories }, 'Drone category training', 200, {
      categoryCount: categories.length,
    });
  } catch (error) { next(error); }
};