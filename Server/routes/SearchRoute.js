const express = require('express');
const router = express.Router();
const SearchController = require('../controllers/searchController');
const { lenientLimiter } = require('../utilities/ratelimiter');


router.get('/search', lenientLimiter, SearchController.searchStationByName); // New route for searching stations by name

module.exports = router;