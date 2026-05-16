const express = require('express');
const router = express.Router();

const { protect } = require('../middleware/auth');
const { upload } = require('../config/upload');
const flightLogController = require('../controllers/flightLogController');

router.use(protect);

router.post('/upload', upload.single('logFile'), flightLogController.uploadLog);
router.get('/', flightLogController.getLogs);
router.get('/:id', flightLogController.getLog);
router.post('/:id/reparse', flightLogController.reparseLog);
router.delete('/:id', flightLogController.deleteLog);

module.exports = router;
