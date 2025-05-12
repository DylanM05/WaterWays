const express = require('express');
const router = express.Router();
const favoritesController = require('../controllers/favoritesController');
const { requireAuth } = require('../middleware/authMiddleware');
const { defaultLimiter, lenientLimiter } = require('../utilities/ratelimiter');


router.use(requireAuth);
router.use(lenientLimiter);
router.post('/', defaultLimiter, favoritesController.addFavorite);
router.delete('/:stationId', defaultLimiter, favoritesController.removeFavorite);
router.get('/', favoritesController.getFavorites);
router.get('/check/:stationId', favoritesController.checkFavorite);

module.exports = router;