const express = require('express');
const { protect, restrictTo } = require('../middleware/auth');
const { buildScopeFilter } = require('../controllers/scopeFilter');

/**
 * buildCrudRouter
 * @param {Model}    Model
 * @param {Array}    populateFields
 * @param {Function} preCreate
 * @param {Object}   options
 *   options.writeRole : string|string[]  — role(s) allowed to POST/PATCH/DELETE.
 *                       If set, write routes are restricted to those roles.
 *   options.readAll   : boolean          — if true, all authenticated users
 *                       read the full collection (no owner scope). Used for
 *                       shared reference data (drone inventory, #002).
 */
const buildCrudRouter = (Model, populateFields = [], preCreate = null, options = {}) => {
  const router = express.Router();
  router.use(protect);

  const { writeRole = null, readAll = false } = options;

  const readFilter = (req) => (readAll ? {} : buildScopeFilter(req.user));

  // write guard middleware — applied to POST/PATCH/DELETE only
  const writeGuard = writeRole
    ? restrictTo(...(Array.isArray(writeRole) ? writeRole : [writeRole]))
    : (_req, _res, next) => next();

  router.get('/', async (req, res, next) => {
    try {
      const { page = 1, limit = 50, search, ...filters } = req.query;
      const query = { ...readFilter(req), ...filters };
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { serialNumber: { $regex: search, $options: 'i' } },
        ];
      }
      const skip = (Number(page) - 1) * Number(limit);
      let q = Model.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit));
      populateFields.forEach((f) => (q = q.populate(f)));
      const [docs, total] = await Promise.all([q, Model.countDocuments(query)]);
      res.json({
        success: true,
        message: 'Fetched',
        data: { [Model.modelName.toLowerCase() + 's']: docs },
        meta: { total, page: Number(page), pages: Math.ceil(total / Number(limit)) },
      });
    } catch (err) { next(err); }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const filter = { _id: req.params.id, ...readFilter(req) };
      let q = Model.findOne(filter);
      populateFields.forEach((f) => (q = q.populate(f)));
      const doc = await q;
      if (!doc) return res.status(404).json({ success: false, message: `${Model.modelName} not found` });
      res.json({ success: true, data: { [Model.modelName.toLowerCase()]: doc } });
    } catch (err) { next(err); }
  });

  router.post('/', writeGuard, async (req, res, next) => {
    try {
      let body = { ...req.body, owner: req.user._id };
      if (preCreate) body = await preCreate(body, req);
      const doc = await Model.create(body);
      res.status(201).json({
        success: true,
        message: `${Model.modelName} created`,
        data: { [Model.modelName.toLowerCase()]: doc },
      });
    } catch (err) { next(err); }
  });

  router.patch('/:id', writeGuard, async (req, res, next) => {
    try {
      // super_admin may edit any record; otherwise scope to owner
      const scope = req.user.role === 'super_admin' ? {} : buildScopeFilter(req.user);
      const filter = { _id: req.params.id, ...scope };
      const doc = await Model.findOneAndUpdate(filter, req.body, { new: true, runValidators: true });
      if (!doc) return res.status(404).json({ success: false, message: `${Model.modelName} not found` });
      res.json({ success: true, message: 'Updated', data: { [Model.modelName.toLowerCase()]: doc } });
    } catch (err) { next(err); }
  });

  router.delete('/:id', writeGuard, async (req, res, next) => {
    try {
      const scope = req.user.role === 'super_admin' ? {} : buildScopeFilter(req.user);
      const filter = { _id: req.params.id, ...scope };
      const doc = await Model.findOneAndDelete(filter);
      if (!doc) return res.status(404).json({ success: false, message: `${Model.modelName} not found` });
      res.json({ success: true, message: `${Model.modelName} deleted` });
    } catch (err) { next(err); }
  });

  return router;
};

module.exports = { buildCrudRouter };
