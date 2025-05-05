const UserSettings = require('../models/UserSettings');

const getUserSettings = async (req, res) => {
  const { userId } = req.params;
  
  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  try {
    const settings = await UserSettings.findOne({ userId });
    
    if (!settings) {
      return res.status(404).json({ 
        message: 'No settings found for this user',
        settings: null 
      });
    }
    
    res.status(200).json(settings);
  } catch (error) {
    console.error('Error fetching user settings:', error);
    res.status(500).json({ error: 'Failed to fetch user settings' });
  }
};

const saveUserSettings = async (req, res) => {
  const { userId } = req.params;
  const { settings } = req.body;
  
  if (!userId || !settings) {
    return res.status(400).json({ error: 'User ID and settings are required' });
  }

  try {
    const updatedSettings = await UserSettings.findOneAndUpdate(
      { userId },
      { 
        userId,
        settings,
        lastUpdated: new Date()
      },
      { new: true, upsert: true }
    );
    
    res.status(200).json(updatedSettings);
  } catch (error) {
    console.error('Error saving user settings:', error);
    res.status(500).json({ error: 'Failed to save user settings' });
  }
};

module.exports = { getUserSettings, saveUserSettings };