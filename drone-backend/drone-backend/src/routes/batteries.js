const { buildCrudRouter } = require('./crudBuilder');
const Battery = require('../models/Battery');
module.exports = buildCrudRouter(Battery);
