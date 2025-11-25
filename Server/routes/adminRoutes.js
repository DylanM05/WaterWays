const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { verifyAuth, getUserIfExists } = require('../middleware/authMiddleware');


router.get('/check', verifyAuth, getUserIfExists, adminController.checkAdminStatus);

module.exports = router;
