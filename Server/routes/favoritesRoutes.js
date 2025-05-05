const express = require('express');
const router = express.Router();
const favoritesController = require('../controllers/favoritesController');
const { verifyAuth, requireAuth } = require('../middleware/authMiddleware');
const { defaultLimiter, lenientLimiter } = require('../utilities/ratelimiter');

// Protect all these routes with authentication
router.use(requireAuth);
router.use(lenientLimiter);

// Routes
router.post('/', favoritesController.addFavorite);
router.delete('/:stationId', favoritesController.removeFavorite);
router.get('/', favoritesController.getFavorites);
router.get('/check/:stationId', favoritesController.checkFavorite);

module.exports = router;