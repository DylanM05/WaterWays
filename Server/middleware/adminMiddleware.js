const Admin = require('../models/Admin');

// Use after requireAuth. Admins are added directly in MongoDB (Admin collection, status: true).
const requireAdmin = async (req, res, next) => {
  try {
    if (await Admin.exists({ userId: req.userId, status: true })) return next();
    return res.status(403).json({ error: 'Admin access required' });
  } catch (error) {
    console.error('Error checking admin access:', error);
    return res.status(500).json({ error: 'Failed to check admin access' });
  }
};

module.exports = { requireAdmin };
