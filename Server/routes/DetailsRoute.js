const express = require('express');
const router = express.Router();
const DetailsController = require('../controllers/detailsController');
const { defaultLimiter, lenientLimiter } = require('../utilities/ratelimiter');

router.get('/:id', defaultLimiter, DetailsController.populateData);
router.get('/coordinates/:id', lenientLimiter, DetailsController.getCoordinates);
router.get('/weather/:id', defaultLimiter, DetailsController.getWeather);
router.get('/pressure/:id', defaultLimiter, DetailsController.getPressure);
router.get('/weather/hourly/:id', defaultLimiter, DetailsController.getHourlyWeather);
router.get('/rivers/:province', defaultLimiter, DetailsController.getRiversByProvince);
router.get('/weather/weekly/:id', defaultLimiter, DetailsController.getWeeklyWeather);
router.get('/latest-water-data/:id', defaultLimiter, DetailsController.getLatestWaterData);

module.exports = router;