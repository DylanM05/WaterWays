const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { ClerkExpressWithAuth } = require('@clerk/clerk-sdk-node');

const clerkAuth = ClerkExpressWithAuth();


router.get('/:userId', clerkAuth, settingsController.getUserSettings);
router.post('/:userId', clerkAuth, settingsController.saveUserSettings);

module.exports = router;