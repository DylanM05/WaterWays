const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { requireAuth } = require('../middleware/authMiddleware');

router.get('/:userId', requireAuth, settingsController.getUserSettings);
router.post('/:userId', requireAuth, settingsController.saveUserSettings);

module.exports = router;