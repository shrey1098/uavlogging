const express = require('express');
const router = express.Router();

const { protect, restrictTo } = require('../middleware/auth');
const analyticsController = require('../controllers/analyticsController');

router.use(protect);

// #009 — drone-class training distribution (super_admin only)
router.get(
  '/drones/category-training',
  restrictTo('super_admin'),
  analyticsController.droneCategoryTraining
);

module.exports = router;