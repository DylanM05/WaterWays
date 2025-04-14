const StationCoordinates = require('../models/StationCoordinates');

exports.searchStationByName = async (req, res) => {
  try {
    const searchQuery = req.query.query;
    
    const escapedQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedQuery, 'i');
  
    const stations = await StationCoordinates.find({ stationName: regex }).limit(20);
    res.json(stations);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'An error occurred while searching' });
  }
};

exports.searchAllRivers = async (req, res) => {
  try {
    const searchQuery = req.query.query.toLowerCase();
    const allStations = await StationCoordinates.find({
      stationName: { $regex: searchQuery, $options: 'i' }
    }).limit(100);
    const groupedResults = {};
    
    allStations.forEach(station => {
      const fullName = station.stationName;
      const baseNameMatch = fullName.match(/^(.*?)\s(NEAR|ABOVE|BELOW|AT|SOUTH OF|NORTH OF|EAST OF|WEST OF|UPSTREAM|DOWNSTREAM)/i);
      const baseName = baseNameMatch ? baseNameMatch[1].trim() : fullName.trim();
      if (baseName.toLowerCase().includes(searchQuery)) {
        if (!groupedResults[baseName]) {
          groupedResults[baseName] = {
            stationName: baseName, 
            station_id: station.station_id,
            province: station.province
          };
        }
      }
    });
    
    const uniqueResults = Object.values(groupedResults);
    res.json(uniqueResults);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'An error occurred while searching' });
  }
};