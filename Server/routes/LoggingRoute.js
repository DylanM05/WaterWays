const express = require('express');
const router = express.Router();
const loggingController = require('../controllers/loggingController');
const { requireApiKey } = require('../utilities/requireApi'); // Import the middleware
const { strictLimiter, visitLimiter } = require('../utilities/ratelimiter');


router.post('/u', visitLimiter, loggingController.logUserVisit);
router.get('/daily', strictLimiter, requireApiKey, loggingController.getUniqueVisitorsToday);
router.get('/weekly', strictLimiter, requireApiKey, loggingController.getUniqueVisitorsWeekly);
router.get('/all', strictLimiter, requireApiKey, loggingController.getUniqueVisitorsAllTime);
router.get('/stats', strictLimiter, requireApiKey, loggingController.getAllVisitorStats);

module.exports = router;