const UserVisit = require('../models/UserVisits'); 

exports.logUserVisit = async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  try {
    const visit = new UserVisit({ userId });
    await visit.save();
    res.status(200).json({ message: 'Visit logged' });
  } catch (error) {
    console.error('Error logging user visit:', error);
    res.status(200).json({ message: 'Log attempt processed' });
  }
};

exports.getUniqueVisitorsToday = async (req, res) => {
    try {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);

      const uniqueUserIds = await UserVisit.distinct('userId', {
        timestamp: { $gte: startOfDay, $lte: endOfDay }
      });

      res.status(200).json({ uniqueVisitorsToday: uniqueUserIds.length });

    } catch (error) {
      console.error('Error getting unique visitors count (today):', error);
      res.status(500).json({ error: 'Failed to retrieve unique visitor count' });
    }
};

exports.getUniqueVisitorsWeekly = async (req, res) => {
    try {
        const now = new Date();
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(now.getDate() - 7);
        sevenDaysAgo.setHours(0, 0, 0, 0); // Start of the day 7 days ago

        const uniqueUserIds = await UserVisit.distinct('userId', {
            timestamp: { $gte: sevenDaysAgo, $lte: now } // From 7 days ago until now
        });

        res.status(200).json({ uniqueVisitorsLast7Days: uniqueUserIds.length });

    } catch (error) {
        console.error('Error getting unique visitors count (weekly):', error);
        res.status(500).json({ error: 'Failed to retrieve unique visitor count' });
    }
};

exports.getUniqueVisitorsAllTime = async (req, res) => {
    try {
        const uniqueUserIds = await UserVisit.distinct('userId');

        res.status(200).json({ uniqueVisitorsAllTime: uniqueUserIds.length });

    } catch (error) {
        console.error('Error getting unique visitors count (all-time):', error);
        res.status(500).json({ error: 'Failed to retrieve unique visitor count' });
    }
};

exports.getAllVisitorStats = async (req, res) => {
    try {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);
        const uniqueDailyIds = await UserVisit.distinct('userId', {
            timestamp: { $gte: startOfDay, $lte: endOfDay }
        });

        const now = new Date();
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(now.getDate() - 7);
        sevenDaysAgo.setHours(0, 0, 0, 0);
        const uniqueWeeklyIds = await UserVisit.distinct('userId', {
            timestamp: { $gte: sevenDaysAgo, $lte: now }
        });

        const uniqueAllTimeIds = await UserVisit.distinct('userId');

        res.status(200).json({
            uniqueVisitorsToday: uniqueDailyIds.length,
            uniqueVisitorsLast7Days: uniqueWeeklyIds.length,
            uniqueVisitorsAllTime: uniqueAllTimeIds.length
        });

    } catch (error) {
        console.error('Error getting combined visitor stats:', error);
        res.status(500).json({ error: 'Failed to retrieve combined visitor stats' });
    }
};