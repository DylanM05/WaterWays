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
  const authenticatedUserId = req.auth?.userId || req.session?.userId;
  const { userId } = req.params;
  const { settings } = req.body;
  
  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ error: 'Valid user ID is required' });
  }
  
  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ error: 'Settings must be a valid object' });
  }
  
  if (authenticatedUserId && authenticatedUserId !== userId) {
    return res.status(403).json({ error: 'Not authorized to modify settings for this user' });
  }

  const validatedSettings = {};
  const allowedSettings = [
    'temperatureUnit', 
    'distanceUnit', 
    'timeFormat', 
    'defaultTab', 
    'theme'
  ];

  const validationRules = {
    temperatureUnit: (value) => ['celsius', 'fahrenheit'].includes(value),
    distanceUnit: (value) => ['metric', 'imperial'].includes(value),
    timeFormat: (value) => ['12h', '24h'].includes(value),
    defaultTab: (value) => ['water', 'pressure', 'weather', 'hourlyforecast', 'weeklyforecast', 'map'].includes(value),
    theme: (value) => ['light', 'dark'].includes(value)
  };

  for (const prop of allowedSettings) {
    if (settings[prop] !== undefined) {
      if (validationRules[prop] && !validationRules[prop](settings[prop])) {
        return res.status(400).json({ error: `Invalid value for ${prop}` });
      }
      validatedSettings[prop] = settings[prop];
    }
  }

  try {
    const updatedSettings = await UserSettings.findOneAndUpdate(
      { userId },
      { 
        userId,
        settings: validatedSettings,
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