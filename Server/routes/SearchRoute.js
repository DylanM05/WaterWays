const express = require('express');
const router = express.Router();
const SearchController = require('../controllers/searchController');


router.get('/search', SearchController.searchStationByName); // New route for searching stations by name

module.exports = router;