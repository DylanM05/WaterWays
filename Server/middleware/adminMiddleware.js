const Admin = require('../models/Admin');

// Admins are added directly in MongoDB (Admin collection, status: true). The unique index is on
// {userId, status}, so a user can have both a true and a false row; any false row wins (fails closed).
async function isAdmin(userId) {
  if (!userId) return false;
  const rows = await Admin.find({ userId: String(userId) }).select('status').lean();
  return rows.some(row => row.status === true) && !rows.some(row => row.status === false);
}

// Use after requireAuth.
const requireAdmin = async (req, res, next) => {
  try {
    if (await isAdmin(req.userId)) return next();
    return res.status(403).json({ error: 'Admin access required' });
  } catch (error) {
    console.error('Error checking admin access:', error);
    return res.status(500).json({ error: 'Failed to check admin access' });
  }
};

module.exports = { isAdmin, requireAdmin };
