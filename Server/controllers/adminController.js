const Admin = require('../models/Admin');

exports.checkAdminStatus = async (req, res) => {
    try {
        const userId = req.userId;
        
        if (!userId) {
            return res.status(401).json({ isAdmin: false, message: 'Authentication required' });
        }
        
        const adminUser = await Admin.findOne({ userId, status: true });
        
        if (adminUser) {
            return res.json({ isAdmin: true });
        } else {
            return res.json({ isAdmin: false });
        }
    } catch (error) {
        console.error('Error checking admin status:', error);
        res.status(500).json({ error: 'Failed to check admin status', isAdmin: false });
    }
}