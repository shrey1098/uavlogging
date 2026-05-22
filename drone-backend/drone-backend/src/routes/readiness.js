const express = require('express');
const router = express.Router();

const { protect, restrictTo } = require('../middleware/auth');
const ctrl = require('../controllers/readinessController');

router.use(protect);

// Operator: own readiness + badges
router.get('/me', ctrl.getMyReadiness);

// Super admin: full unit readiness list (place before :userId)
router.get('/', restrictTo('super_admin'), ctrl.listAllReadiness);

// Super admin: any operator; operator: self only (enforced in controller)
router.get('/:userId', ctrl.getReadinessFor);

module.exports = router;
