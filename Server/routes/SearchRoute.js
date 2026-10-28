const express = require('express');
const router = express.Router();
const SearchController = require('../controllers/searchController');
const { cacheFor } = require('../middleware/cacheControl');

// Search runs on every keystroke; station names rarely change.
const SEARCH = cacheFor(60 * 60);

router.get('/search', SEARCH, SearchController.searchStationByName);
router.get('/search-all-rivers', SEARCH, SearchController.searchAllRivers);

module.exports = router;