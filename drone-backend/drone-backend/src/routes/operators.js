const { buildCrudRouter } = require('./crudBuilder');
const Operator = require('../models/Operator');
module.exports = buildCrudRouter(Operator);
