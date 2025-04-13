const express = require('express');
const router = express.Router();
const secretsController = require('../controllers/secretsController');
const { defaultLimiter } = require('../utilities/ratelimiter');

router.get('/proxy-maps/:latitude/:longitude', defaultLimiter, secretsController.getMapProxyUrl);
router.get('/proxy/map', defaultLimiter, secretsController.serveMapProxy);

module.exports = router;