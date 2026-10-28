const crypto = require('crypto');
const InviteLink = require('../models/InviteLink');
const LifetimePremium = require('../models/LifetimePremium');


exports.generateInviteLink = async (req, res) => {
  try {
    const userId = req.userId;
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
    const userId = req.userId;
    
    const inviteLinks = await InviteLink.find({ createdBy: userId });
    
    res.json({ success: true, inviteLinks });
  } catch (error) {
    console.error('Error listing invite links:', error);
    res.status(500).json({ error: 'Failed to list invite links' });
  }
};


exports.redeemInviteLink = async (req, res) => {
  try {
    const userId = req.userId;
    const { code } = req.body;
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Invalid invite code format' });
    }
    if (!code.match(/^[0-9a-f]{12}$/i)) {
      return res.status(400).json({ error: 'Invalid invite code format' });
    }
    const existingLifetime = await LifetimePremium.findOne({ userId });
    
    if (existingLifetime) {
      return res.status(400).json({ error: 'You already have lifetime premium access' });
    }

    // Claim the code in one step, so two redemptions of the same code can't both succeed.
    const inviteLink = await InviteLink.findOneAndUpdate(
      { code, isRedeemed: false },
      { $set: { isRedeemed: true, redeemedBy: userId } },
      { new: true }
    );
    if (!inviteLink) {
      return res.status(404).json({ error: 'Invalid or already used invite code' });
    }

    try {
      await LifetimePremium.create({
        userId,
        grantedBy: inviteLink.createdBy,
        inviteCode: code
      });
    } catch (error) {
      // Release the code so it isn't used up by a failed grant.
      await InviteLink.updateOne({ code }, { $set: { isRedeemed: false, redeemedBy: null } });
      throw error;
    }
    
    res.json({ 
      success: true, 
      message: 'Congratulations! You now have lifetime premium access!' 
    });
  } catch (error) {
    console.error('Error redeeming invite link:', error);
    res.status(500).json({ error: 'Failed to redeem invite link' });
  }
};