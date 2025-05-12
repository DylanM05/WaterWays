const express = require('express');
const router = express.Router();
const inviteController = require('../controllers/inviteController');
const { verifyAuth, getUserIfExists } = require('../middleware/authMiddleware');
const { strictLimiter } = require('../utilities/ratelimiter');

router.use(strictLimiter);
router.post('/generate', verifyAuth, getUserIfExists, inviteController.generateInviteLink);
router.get('/list', verifyAuth, getUserIfExists, inviteController.listInviteLinks);
router.post('/redeem', verifyAuth, getUserIfExists, inviteController.redeemInviteLink);

module.exports = router;