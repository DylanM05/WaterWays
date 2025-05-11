const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { verifyAuth, getUserIfExists } = require('../middleware/authMiddleware');


// Protected routes (require authentication)
// Remove the '/admin' prefix - it's already included when mounting the router
router.post('/m', adminController.CreateAdmin);
router.get('/check', verifyAuth, getUserIfExists, adminController.checkAdminStatus);

module.exports = router;