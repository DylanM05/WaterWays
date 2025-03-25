const express = require('express');
const router = express.Router();
const secretsController = require('../controllers/secretsController');

router.get('/proxy-maps/:latitude/:longitude', secretsController.getMapProxyUrl);
router.get('/proxy/map', secretsController.serveMapProxy);

module.exports = router;