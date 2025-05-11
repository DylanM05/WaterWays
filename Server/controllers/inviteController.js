const crypto = require('crypto');
const InviteLink = require('../models/InviteLink');
const LifetimePremium = require('../models/LifetimePremium');


exports.generateInviteLink = async (req, res) => {
  try {
    const userId = req.auth?.userId || req.session?.userId;
    const code = crypto.randomBytes(6).toString('hex');
    const inviteLink = await InviteLink.create({
      code,
      createdBy: userId
    });
    res.json({ 
      success: true, 
      inviteLinks: [inviteLink],
      inviteLink: `${process.env.FRONTEND_URL}/redeem?code=${code}` 
    });
  } catch (error) {
    console.error('Error generating invite link:', error);
    res.status(500).json({ error: 'Failed to generate invite link' });
  }
};


exports.listInviteLinks = async (req, res) => {
  try {
    const userId = req.auth?.userId || req.session?.userId;
    
    const inviteLinks = await InviteLink.find({ createdBy: userId });
    
    res.json({ success: true, inviteLinks });
  } catch (error) {
    console.error('Error listing invite links:', error);
    res.status(500).json({ error: 'Failed to list invite links' });
  }
};


exports.redeemInviteLink = async (req, res) => {
  try {
    const userId = req.auth?.userId || req.session?.userId;
    const { code } = req.body;
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Invalid invite code format' });
    }
    if (!code.match(/^[0-9a-f]{12}$/i)) {
      return res.status(400).json({ error: 'Invalid invite code format' });
    }
    const inviteLink = await InviteLink.findOne({ code, isRedeemed: false });
    
    if (!inviteLink) {
      return res.status(404).json({ error: 'Invalid or already used invite code' });
    }
    const existingLifetime = await LifetimePremium.findOne({ userId });
    
    if (existingLifetime) {
      return res.status(400).json({ error: 'You already have lifetime premium access' });
    }
    inviteLink.isRedeemed = true;
    inviteLink.redeemedBy = userId;
    await inviteLink.save();
    
    await LifetimePremium.create({
      userId,
      grantedBy: inviteLink.createdBy,
      inviteCode: code
    });
    
    res.json({ 
      success: true, 
      message: 'Congratulations! You now have lifetime premium access!' 
    });
  } catch (error) {
    console.error('Error redeeming invite link:', error);
    res.status(500).json({ error: 'Failed to redeem invite link' });
  }
};