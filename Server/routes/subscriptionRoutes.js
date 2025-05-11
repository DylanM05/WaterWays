const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const { verifyAuth, getUserIfExists } = require('../middleware/authMiddleware');


router.post('/cmcs', verifyAuth, getUserIfExists, subscriptionController.createMonthlyCheckoutSession);
router.post('/cacs', verifyAuth, getUserIfExists, subscriptionController.createAnnualCheckoutSession);
router.get('/status', verifyAuth, getUserIfExists, subscriptionController.checkSubscriptionStatus);

module.exports = router;