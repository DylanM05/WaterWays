const StationCoordinates = require('../models/StationCoordinates');

exports.searchStationByName = async (req, res) => {
  const { name } = req.query;

  try {
    const stations = await StationCoordinates.find({ stationName: new RegExp(name, 'i') });
    res.json(stations);
  } catch (error) {
    console.error('Error searching for station:', error);
    res.status(500).json({ error: 'Error searching for station' });
  }
};