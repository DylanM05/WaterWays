const express = require('express');
const router = express.Router();
const DetailsController = require('../controllers/detailsController');
const HistoryController = require('../controllers/historyController');
const { requireAuth } = require('../middleware/authMiddleware');
const { requirePremium } = require('../middleware/premiumMiddleware');
const { cacheFor } = require('../middleware/cacheControl');


// Client cache lifetimes; readings sync every 10 minutes and forecasts are cached for 15 on the server.
const STATION_INFO = cacheFor(24 * 60 * 60);
const RIVER_LIST = cacheFor(60 * 60);
const WEATHER = cacheFor(15 * 60);
const READINGS = cacheFor(5 * 60);

router.get('/coordinates/:id', STATION_INFO, DetailsController.getCoordinates);
router.get('/weather/:id', WEATHER, DetailsController.getWeather);
router.get('/pressure/:id', WEATHER, DetailsController.getPressure);
router.get('/weather/hourly/:id', WEATHER, DetailsController.getHourlyWeather);
router.get('/rivers/:province', RIVER_LIST, DetailsController.getRiversByProvince);
router.get('/weather/weekly/:id', WEATHER, DetailsController.getWeeklyWeather);
router.get('/latest-water-data', READINGS, DetailsController.getLatestWaterDataBatch);
router.get('/latest-water-data/:id', READINGS, DetailsController.getLatestWaterData);
router.get('/water-data/:id/:days', READINGS, DetailsController.getWaterData);
// Historical data is a premium feature.
router.get('/water-archive/:id/:period', requireAuth, requirePremium, DetailsController.getArchivedWaterData);
router.get('/water-history/:id', requireAuth, requirePremium, HistoryController.getWaterHistory);

module.exports = router;
