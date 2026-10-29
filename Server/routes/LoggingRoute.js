const express = require('express');
const router = express.Router();
const loggingController = require('../controllers/loggingController');
const { requireApiKey } = require('../utilities/requireApi'); // Import the middleware
const { defaultLimiter } = require('../utilities/ratelimiter');


router.post('/u', defaultLimiter, loggingController.logUserVisit);
router.get('/daily', requireApiKey, loggingController.getUniqueVisitorsToday);
router.get('/weekly', requireApiKey, loggingController.getUniqueVisitorsWeekly);
router.get('/all', requireApiKey, loggingController.getUniqueVisitorsAllTime);
router.get('/stats', requireApiKey, loggingController.getAllVisitorStats);

module.exports = router;