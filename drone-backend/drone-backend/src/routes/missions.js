// #002 — mission create/edit/delete restricted to super_admin.
// Read stays owner-scoped (operator sees own, super_admin sees all).
const { buildCrudRouter } = require('./crudBuilder');
const Mission = require('../models/Mission');

module.exports = buildCrudRouter(
  Mission,
  [
    { path: 'drone', select: 'name model manufacturer frameType' },
    { path: 'operator', select: 'name licenseNumber' },
    { path: 'batteries', select: 'name capacity cycleCount status' },
    { path: 'flightLog', select: 'originalName logType parseStatus fileSize' },
  ],
  null,
  { writeRole: 'super_admin' }
);
