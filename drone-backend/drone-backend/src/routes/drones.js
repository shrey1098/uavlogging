// src/routes/drones.js
// #002 — drone inventory: read open to all auth users, write super_admin only
const { buildCrudRouter } = require('./crudBuilder');
const Drone = require('../models/Drone');

module.exports = buildCrudRouter(
  Drone,
  [],
  null,
  { readAll: true, writeRole: 'super_admin' }
);
