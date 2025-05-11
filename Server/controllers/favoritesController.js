const Favorite = require('../models/Favorite');

exports.addFavorite = async (req, res) => {
  try {
    const { stationId, stationName, province } = req.body;
    const userId = req.auth?.userId || req.session?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!stationId || typeof stationId !== 'string') {
      return res.status(400).json({ error: 'Valid station ID string is required' });
    }
    if (stationName && typeof stationName !== 'string') {
      return res.status(400).json({ error: 'Station name must be a string' });
    }
    if (province && typeof province !== 'string') {
      return res.status(400).json({ error: 'Province must be a string' });
    }
    const existingFavorite = await Favorite.findOne({ 
      userId: userId.toString(), 
      stationId: stationId.toString() 
    });

    const favorite = new Favorite({
      userId,
      stationId,
      stationName: stationName || `Station ${stationId}`,
      province: province || 'Unknown'
    });

    await favorite.save();
    res.status(201).json({ message: 'Station added to favorites', favorite });
  } catch (error) {
    console.error('Error adding favorite:', error);
    res.status(500).json({ error: 'Failed to add station to favorites' });
  }
};

exports.removeFavorite = async (req, res) => {
  try {
    const { stationId } = req.params;

    if (!stationId || typeof stationId !== 'string') {
      return res.status(400).json({ error: 'Valid station ID is required' });
    }
    const userId = req.auth?.userId || req.session?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const result = await Favorite.findOneAndDelete({ userId, stationId });
    
    if (!result) {
      return res.status(404).json({ error: 'Favorite not found' });
    }

    res.json({ message: 'Station removed from favorites' });
  } catch (error) {
    console.error('Error removing favorite:', error);
    res.status(500).json({ error: 'Failed to remove station from favorites' });
  }
};

exports.getFavorites = async (req, res) => {
  try {
    const userId = req.auth?.userId || req.session?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const favorites = await Favorite.find({ userId }).sort({ createdAt: -1 });
    
    res.json(favorites);
  } catch (error) {
    console.error('Error fetching favorites:', error);
    res.status(500).json({ error: 'Failed to fetch favorites' });
  }
};

exports.checkFavorite = async (req, res) => {
  try {
    const { stationId } = req.params;

    if (!stationId || typeof stationId !== 'string') {
      return res.status(400).json({ error: 'Valid station ID is required' });
    }
    const userId = req.auth?.userId || req.session?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const favorite = await Favorite.findOne({ userId, stationId });
    
    res.json({ isFavorite: !!favorite });
  } catch (error) {
    console.error('Error checking favorite status:', error);
    res.status(500).json({ error: 'Failed to check favorite status' });
  }
};