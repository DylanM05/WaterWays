const StationCoordinates = require('../models/StationCoordinates');

exports.searchStationByName = async (req, res) => {
  try {
    const searchQuery = req.query.query;
    
    const escapedQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedQuery, 'i');
  
    const stations = await StationCoordinates.find({ name: regex }).limit(20);
    res.json(stations);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'An error occurred while searching' });
  }
};