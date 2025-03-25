const express = require('express');
const router = express.Router();
const DetailsController = require('../controllers/detailsController');

router.get('/:id', DetailsController.populateData);
router.get('/coordinates/:id', DetailsController.getCoordinates);
router.get('/weather/:id', DetailsController.getWeather);
router.get('/pressure/:id', DetailsController.getPressure);
router.get('/weather/hourly/:id', DetailsController.getHourlyWeather);
router.get('/rivers/:province', DetailsController.getRiversByProvince);
router.get('/weather/weekly/:id', DetailsController.getWeeklyWeather);
router.get('/latest-water-data/:id', DetailsController.getLatestWaterData);

module.exports = router;