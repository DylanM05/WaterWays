const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const { verifyAuth, getUserIfExists } = require('../middleware/authMiddleware');
const { strictLimiter, defaultLimiter, lenientLimiter } = require('../utilities/ratelimiter');

router.post('/cmcs', strictLimiter, verifyAuth, getUserIfExists, subscriptionController.createMonthlyCheckoutSession);
router.post('/cacs', strictLimiter, verifyAuth, getUserIfExists, subscriptionController.createAnnualCheckoutSession);
router.get('/status', lenientLimiter, verifyAuth, getUserIfExists, subscriptionController.checkSubscriptionStatus);
router.get('/success', defaultLimiter, verifyAuth, getUserIfExists, subscriptionController.handleSubscriptionSuccess);
router.post('/cancel', strictLimiter, verifyAuth, getUserIfExists, subscriptionController.cancelSubscription);
router.post('/reactivate', strictLimiter, verifyAuth, getUserIfExists, subscriptionController.reactivateSubscription);
router.get('/billing-portal', strictLimiter, verifyAuth, getUserIfExists, subscriptionController.createBillingPortalSession);

module.exports = router;