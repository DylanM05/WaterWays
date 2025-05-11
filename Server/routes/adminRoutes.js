const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { verifyAuth, getUserIfExists } = require('../middleware/authMiddleware');


router.post('/m', adminController.CreateAdmin);
router.get('/check', verifyAuth, getUserIfExists, adminController.checkAdminStatus);

module.exports = router;