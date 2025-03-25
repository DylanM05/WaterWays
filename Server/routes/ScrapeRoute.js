const express = require('express');
const router = express.Router();
const scraperController = require('../controllers/scraperController');


router.post('/run', scraperController.scrapeData);

module.exports = router;