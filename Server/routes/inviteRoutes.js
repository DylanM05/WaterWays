const express = require('express');
const router = express.Router();
const inviteController = require('../controllers/inviteController');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireAdmin } = require('../middleware/adminMiddleware');
const { strictLimiter } = require('../utilities/ratelimiter');

router.use(strictLimiter);
// Invite links grant lifetime premium, so only admins can create or see them.
router.post('/generate', requireAuth, requireAdmin, inviteController.generateInviteLink);
router.get('/list', requireAuth, requireAdmin, inviteController.listInviteLinks);
router.post('/redeem', requireAuth, inviteController.redeemInviteLink);

module.exports = router;