const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const { verifyAuth, getUserIfExists } = require('../middleware/authMiddleware');

// Create a checkout session - requires authentication
router.post('/cmcs', verifyAuth, getUserIfExists, subscriptionController.createMonthlyCheckoutSession);
router.post('/cacs', verifyAuth, getUserIfExists, subscriptionController.createAnnualCheckoutSession);
router.get('/status', verifyAuth, getUserIfExists, subscriptionController.checkSubscriptionStatus);
router.get('/test-webhook', verifyAuth, subscriptionController.testWebhook);

module.exports = router;