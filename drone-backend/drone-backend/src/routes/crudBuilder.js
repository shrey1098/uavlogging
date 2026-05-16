const express = require('express');
const { protect } = require('../middleware/auth');
const { buildScopeFilter } = require('../controllers/scopeFilter');

const buildCrudRouter = (Model, populateFields = [], preCreate = null) => {
  const router = express.Router();
  router.use(protect);

  router.get('/', async (req, res, next) => {
    try {
      const { page = 1, limit = 50, search, ...filters } = req.query;
      const query = { ...buildScopeFilter(req.user), ...filters };
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
      const filter = { _id: req.params.id, ...buildScopeFilter(req.user) };
      let q = Model.findOne(filter);
      populateFields.forEach((f) => (q = q.populate(f)));
      const doc = await q;
      if (!doc) return res.status(404).json({ success: false, message: `${Model.modelName} not found` });
      res.json({ success: true, data: { [Model.modelName.toLowerCase()]: doc } });
    } catch (err) { next(err); }
  });

  router.post('/', async (req, res, next) => {
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

  router.patch('/:id', async (req, res, next) => {
    try {
      const filter = { _id: req.params.id, ...buildScopeFilter(req.user) };
      const doc = await Model.findOneAndUpdate(filter, req.body, { new: true, runValidators: true });
      if (!doc) return res.status(404).json({ success: false, message: `${Model.modelName} not found` });
      res.json({ success: true, message: 'Updated', data: { [Model.modelName.toLowerCase()]: doc } });
    } catch (err) { next(err); }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const filter = { _id: req.params.id, ...buildScopeFilter(req.user) };
      const doc = await Model.findOneAndDelete(filter);
      if (!doc) return res.status(404).json({ success: false, message: `${Model.modelName} not found` });
      res.json({ success: true, message: `${Model.modelName} deleted` });
    } catch (err) { next(err); }
  });

  return router;
};

module.exports = { buildCrudRouter };
