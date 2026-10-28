const express = require('express');
const router = express.Router();
const secretsController = require('../controllers/secretsController');
const { defaultLimiter } = require('../utilities/ratelimiter');

router.use(defaultLimiter);
router.get('/proxy-maps/:latitude/:longitude', secretsController.getMapProxyUrl);
router.get('/proxy/map', secretsController.serveMapProxy);

module.exports = router;