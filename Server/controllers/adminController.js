const { isAdmin } = require('../middleware/adminMiddleware');

exports.checkAdminStatus = async (req, res) => {
    try {
        const userId = req.userId;
        
        if (!userId) {
            return res.status(401).json({ isAdmin: false, message: 'Authentication required' });
        }
        
        if (await isAdmin(userId)) {
            return res.json({ isAdmin: true });
        } else {
            return res.json({ isAdmin: false });
        }
    } catch (error) {
        console.error('Error checking admin status:', error);
        res.status(500).json({ error: 'Failed to check admin status', isAdmin: false });
    }
}