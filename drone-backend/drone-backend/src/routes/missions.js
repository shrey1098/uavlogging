const { buildCrudRouter } = require('./crudBuilder');
const Mission = require('../models/Mission');

module.exports = buildCrudRouter(
  Mission,
  [
    { path: 'drone', select: 'name model manufacturer frameType' },
    { path: 'operator', select: 'name licenseNumber' },
    { path: 'batteries', select: 'name capacity cycleCount status' },
    { path: 'flightLog', select: 'originalName logType parseStatus fileSize' },
  ]
);
