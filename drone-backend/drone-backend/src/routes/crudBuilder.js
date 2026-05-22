const express = require('express');
const { protect, restrictTo } = require('../middleware/auth');
const { buildScopeFilter } = require('../controllers/scopeFilter');
const {
  sendSuccess, sendCreated, sendNotFound,
} = require('../utils/response');

/**
 * buildCrudRouter — generic CRUD factory
 *
 * @param {Model}    Model
 * @param {Array}    populateFields  paths to populate on read
 * @param {Function} preCreate       (body, req) => mutatedBody, async ok
 * @param {Object}   options
 *   options.writeRole : role(s) allowed to POST/PATCH/DELETE
 *   options.readAll   : if true, all auth users read full collection
 *
 * Response shape: all routes use helpers (#008) — payload always under
 * `data`, message is a string only.
 */
const buildCrudRouter = (Model, populateFields = [], preCreate = null, options = {}) => {
  const router = express.Router();
  router.use(protect);

  const { writeRole = null, readAll = false } = options;
  const readFilter = (req) => (readAll ? {} : buildScopeFilter(req.user));
  const writeGuard = writeRole
    ? restrictTo(...(Array.isArray(writeRole) ? writeRole : [writeRole]))
    : (_req, _res, next) => next();

  const listKey  = Model.modelName.toLowerCase() + 's';
  const docKey   = Model.modelName.toLowerCase();
  const niceName = Model.modelName;

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
      return sendSuccess(res, { [listKey]: docs }, 'Fetched', 200, {
        total, page: Number(page), pages: Math.ceil(total / Number(limit)),
      });
    } catch (err) { next(err); }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const filter = { _id: req.params.id, ...readFilter(req) };
      let q = Model.findOne(filter);
      populateFields.forEach((f) => (q = q.populate(f)));
      const doc = await q;
      if (!doc) return sendNotFound(res, niceName);
      return sendSuccess(res, { [docKey]: doc });
    } catch (err) { next(err); }
  });

  router.post('/', writeGuard, async (req, res, next) => {
    try {
      let body = { ...req.body, owner: req.user._id };
      if (preCreate) body = await preCreate(body, req);
      const doc = await Model.create(body);
      return sendCreated(res, { [docKey]: doc }, `${niceName} created`);
    } catch (err) { next(err); }
  });

  router.patch('/:id', writeGuard, async (req, res, next) => {
    try {
      const scope = req.user.role === 'super_admin' ? {} : buildScopeFilter(req.user);
      const filter = { _id: req.params.id, ...scope };
      const doc = await Model.findOneAndUpdate(filter, req.body, { new: true, runValidators: true });
      if (!doc) return sendNotFound(res, niceName);
      return sendSuccess(res, { [docKey]: doc }, 'Updated');
    } catch (err) { next(err); }
  });

  router.delete('/:id', writeGuard, async (req, res, next) => {
    try {
      const scope = req.user.role === 'super_admin' ? {} : buildScopeFilter(req.user);
      const filter = { _id: req.params.id, ...scope };
      const doc = await Model.findOneAndDelete(filter);
      if (!doc) return sendNotFound(res, niceName);
      return sendSuccess(res, null, `${niceName} deleted`);
    } catch (err) { next(err); }
  });

  return router;
};

module.exports = { buildCrudRouter };
