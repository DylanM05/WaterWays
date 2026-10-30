const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const appleSubscriptionController = require('../controllers/appleSubscriptionController');
const { requireAuth } = require('../middleware/authMiddleware');
const { strictLimiter, defaultLimiter } = require('../utilities/ratelimiter');

// Everything except Apple's server notifications acts for a signed-in user.
router.post('/cmcs', strictLimiter, requireAuth, subscriptionController.createMonthlyCheckoutSession);
router.post('/cacs', strictLimiter, requireAuth, subscriptionController.createAnnualCheckoutSession);
router.get('/status', requireAuth, subscriptionController.checkSubscriptionStatus);
router.get('/apple/account-token', strictLimiter, requireAuth, appleSubscriptionController.getAccountToken);
router.post('/apple/verify-transaction', defaultLimiter, requireAuth, appleSubscriptionController.verifyTransaction);
router.post('/apple/notifications', appleSubscriptionController.handleServerNotification);
router.get('/success', defaultLimiter, requireAuth, subscriptionController.handleSubscriptionSuccess);
router.post('/cancel', strictLimiter, requireAuth, subscriptionController.cancelSubscription);
router.post('/reactivate', strictLimiter, requireAuth, subscriptionController.reactivateSubscription);
router.get('/billing-portal', strictLimiter, requireAuth, subscriptionController.createBillingPortalSession);

module.exports = router;