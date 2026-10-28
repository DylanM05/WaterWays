const StationCoordinates = require('../models/StationCoordinates');
const { splitStationName } = require('../utilities/riverNames');

const MAX_QUERY_LENGTH = 100;

// Search text is matched literally; unescaped, it would run as a user-supplied regular expression.
function searchRegex(query) {
  return new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

function readQuery(req, res) {
  const query = req.query.query;
  if (typeof query !== 'string') {
    res.status(400).json({ error: 'query is required' });
    return null;
  }
  return query.trim().slice(0, MAX_QUERY_LENGTH);
}

exports.searchStationByName = async (req, res) => {
  const searchQuery = readQuery(req, res);
  if (searchQuery === null) return;
  if (!searchQuery) return res.json([]);

  try {
    const regex = searchRegex(searchQuery);
  
    const stations = await StationCoordinates.find({ stationName: regex }).limit(20);
    res.json(stations);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'An error occurred while searching' });
  }
};

exports.searchAllRivers = async (req, res) => {
  const rawQuery = readQuery(req, res);
  if (rawQuery === null) return;
  if (!rawQuery) return res.json([]);

  try {
    const searchQuery = rawQuery.toLowerCase();
    const allStations = await StationCoordinates.find({ stationName: searchRegex(searchQuery) })
      .limit(100)
      .lean();
    const groupedResults = {};
    
    // Same river names as /details/rivers, so a result opens that river's page.
    allStations.forEach(station => {
      const { riverName } = splitStationName(station.stationName);
      if (!riverName.toLowerCase().includes(searchQuery)) return;
      // Rivers such as the Red River exist in more than one province.
      const key = `${station.province}|${riverName}`;
      if (!groupedResults[key]) {
        groupedResults[key] = {
          stationName: riverName,
          station_id: station.station_id,
          province: station.province
        };
      }
    });
    
    const uniqueResults = Object.values(groupedResults);
    res.json(uniqueResults);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'An error occurred while searching' });
  }
};