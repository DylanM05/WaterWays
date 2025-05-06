const express = require('express');
const router = express.Router();
const DetailsController = require('../controllers/detailsController');
const { defaultLimiter, lenientLimiter } = require('../utilities/ratelimiter');

router.get('/:id', lenientLimiter, DetailsController.populateData);
router.get('/coordinates/:id', lenientLimiter, DetailsController.getCoordinates);
router.get('/weather/:id', lenientLimiter, DetailsController.getWeather);
router.get('/pressure/:id', lenientLimiter, DetailsController.getPressure);
router.get('/weather/hourly/:id', lenientLimiter, DetailsController.getHourlyWeather);
router.get('/rivers/:province', lenientLimiter, DetailsController.getRiversByProvince);
router.get('/weather/weekly/:id', lenientLimiter, DetailsController.getWeeklyWeather);
router.get('/latest-water-data/:id', lenientLimiter, DetailsController.getLatestWaterData);

module.exports = router;