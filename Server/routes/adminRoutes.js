const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { verifyAuth } = require('../middleware/authMiddleware');


router.get('/check', verifyAuth, adminController.checkAdminStatus);

module.exports = router;
