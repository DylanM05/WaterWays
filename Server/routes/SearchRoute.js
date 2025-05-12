const express = require('express');
const router = express.Router();
const SearchController = require('../controllers/searchController');
const { lenientLimiter } = require('../utilities/ratelimiter');

router.use(lenientLimiter);
router.get('/search', lenientLimiter, SearchController.searchStationByName);
router.get('/search-all-rivers', lenientLimiter, SearchController.searchAllRivers);

module.exports = router;