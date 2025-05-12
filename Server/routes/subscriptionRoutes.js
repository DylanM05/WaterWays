const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const { verifyAuth, getUserIfExists } = require('../middleware/authMiddleware');
const { strictLimiter, defaultLimiter } = require('../utilities/ratelimiter');

router.post('/cmcs', strictLimiter, verifyAuth, getUserIfExists, subscriptionController.createMonthlyCheckoutSession);
router.post('/cacs', strictLimiter, verifyAuth, getUserIfExists, subscriptionController.createAnnualCheckoutSession);
router.get('/status', defaultLimiter, verifyAuth, getUserIfExists, subscriptionController.checkSubscriptionStatus);

module.exports = router;