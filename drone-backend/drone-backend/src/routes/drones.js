// src/routes/drones.js
const { buildCrudRouter } = require('./crudBuilder');
const Drone = require('../models/Drone');
module.exports = buildCrudRouter(Drone);
