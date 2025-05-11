const crypto = require('crypto');
const InviteLink = require('../models/InviteLink');
const LifetimePremium = require('../models/LifetimePremium');

// Generate a new invite link (restricted to admin/you)
exports.generateInviteLink = async (req, res) => {
  try {
    const userId = req.auth?.userId || req.session?.userId;
    
    // Generate a unique code
    const code = crypto.randomBytes(6).toString('hex');
    
    // Save the invite link
    const inviteLink = await InviteLink.create({
      code,
      createdBy: userId
    });
    
    // Return the complete invite object in a structure the frontend expects
    res.json({ 
      success: true, 
      inviteLinks: [inviteLink], // This is what the frontend expects from the list endpoint
      inviteLink: `${process.env.FRONTEND_URL}/redeem?code=${code}` 
    });
  } catch (error) {
    console.error('Error generating invite link:', error);
    res.status(500).json({ error: 'Failed to generate invite link' });
  }
};

// List all invite links created by user
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

// Redeem an invite link
exports.redeemInviteLink = async (req, res) => {
  try {
    const userId = req.auth?.userId || req.session?.userId;
    const { code } = req.body;
    
    // Validate input type and format
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Invalid invite code format' });
    }
    
    // Validate code format (should be a hexadecimal string of correct length)
    // Since you generate codes with crypto.randomBytes(6).toString('hex')
    if (!code.match(/^[0-9a-f]{12}$/i)) {
      return res.status(400).json({ error: 'Invalid invite code format' });
    }
    
    // Find the invite link (now with validated input)
    const inviteLink = await InviteLink.findOne({ code, isRedeemed: false });
    
    if (!inviteLink) {
      return res.status(404).json({ error: 'Invalid or already used invite code' });
    }
    
    // Check if user is already a lifetime premium member
    const existingLifetime = await LifetimePremium.findOne({ userId });
    
    if (existingLifetime) {
      return res.status(400).json({ error: 'You already have lifetime premium access' });
    }
    
    // Mark the link as redeemed
    inviteLink.isRedeemed = true;
    inviteLink.redeemedBy = userId;
    await inviteLink.save();
    
    // Grant lifetime premium
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