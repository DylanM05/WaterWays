const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const appleSubscriptionController = require('../controllers/appleSubscriptionController');
const { verifyAuth } = require('../middleware/authMiddleware');
const { strictLimiter, defaultLimiter } = require('../utilities/ratelimiter');

router.post('/cmcs', strictLimiter, verifyAuth, subscriptionController.createMonthlyCheckoutSession);
router.post('/cacs', strictLimiter, verifyAuth, subscriptionController.createAnnualCheckoutSession);
router.get('/status', verifyAuth, subscriptionController.checkSubscriptionStatus);
router.get('/apple/account-token', strictLimiter, verifyAuth, appleSubscriptionController.getAccountToken);
router.post('/apple/verify-transaction', defaultLimiter, verifyAuth, appleSubscriptionController.verifyTransaction);
router.post('/apple/notifications', appleSubscriptionController.handleServerNotification);
router.get('/success', defaultLimiter, verifyAuth, subscriptionController.handleSubscriptionSuccess);
router.post('/cancel', strictLimiter, verifyAuth, subscriptionController.cancelSubscription);
router.post('/reactivate', strictLimiter, verifyAuth, subscriptionController.reactivateSubscription);
router.get('/billing-portal', strictLimiter, verifyAuth, subscriptionController.createBillingPortalSession);

module.exports = router;