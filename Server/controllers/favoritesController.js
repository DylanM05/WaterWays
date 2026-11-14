const Favorite = require('../models/Favorite');
const { PROVINCES, normalizeStationId } = require('../utilities/stationIds');

// Limits far above real use, so only junk is turned away.
const MAX_NAME_LENGTH = 200;
const MAX_COORDINATE_LENGTH = 32;
const MAX_FAVORITES_PER_USER = 200;
const MAX_RIVER_STATIONS = 500;
exports.MAX_FAVORITES_PER_USER = MAX_FAVORITES_PER_USER;

const tooLong = (value, max = MAX_NAME_LENGTH) => typeof value === 'string' && value.length > max;

// True when adding a new favourite would take the user past the cap; re-saving one they have is fine.
async function overFavoriteLimit(userId, stationId) {
  if (await Favorite.exists({ userId, stationId })) return false;
  return await Favorite.countDocuments({ userId }) >= MAX_FAVORITES_PER_USER;
}
const limitError = { error: `You can save up to ${MAX_FAVORITES_PER_USER} favourites. Remove one to add another.` };

// One saved river per user, province and (case-insensitive) river name.
function riverFavoriteId(province, riverName) {
  return `river:${Buffer.from(`${province}|${riverName.toLowerCase()}`).toString('base64url')}`;
}
exports.riverFavoriteId = riverFavoriteId;

exports.addFavorite = async (req, res) => {
  try {
    const { stationName } = req.body;
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const stationId = typeof req.body.stationId === 'string' ? normalizeStationId(req.body.stationId.trim()) : null;
    if (!stationId) {
      return res.status(400).json({ error: 'Valid station ID string is required' });
    }
    if (stationName && typeof stationName !== 'string') {
      return res.status(400).json({ error: 'Station name must be a string' });
    }
    if (tooLong(stationName)) {
      return res.status(400).json({ error: `Station name must be at most ${MAX_NAME_LENGTH} characters` });
    }
    if (req.body.province && typeof req.body.province !== 'string') {
      return res.status(400).json({ error: 'Province must be a string' });
    }
    // The web app sends 'Unknown' when it doesn't know the station's province.
    const province = req.body.province ? req.body.province.trim().toUpperCase() : '';
    if (province && province !== 'UNKNOWN' && !PROVINCES.has(province)) {
      return res.status(400).json({ error: 'Invalid province' });
    }
    if (await overFavoriteLimit(userId.toString(), stationId)) {
      return res.status(409).json(limitError);
    }
    const favorite = await Favorite.findOneAndUpdate(
      { userId: userId.toString(), stationId },
      {
        $setOnInsert: {
          userId: userId.toString(),
          stationId,
          favoriteType: 'station',
          stationName: stationName || `Station ${stationId}`,
          province: PROVINCES.has(province) ? province : 'Unknown'
        }
      },
      { upsert: true, new: true, runValidators: true }
    );

    return res.status(201).json({ message: 'Station added to favorites', favorite });
  } catch (error) {
    console.error('Error adding favorite:', error);
    res.status(500).json({ error: 'Failed to add station to favorites' });
  }
};

exports.addRiverFavorite = async (req, res) => {
  try {
    const userId = req.userId;
    const { riverName, province, stations } = req.body;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });
    if (typeof riverName !== 'string' || !riverName.trim() || typeof province !== 'string' || !province.trim()) {
      return res.status(400).json({ error: 'River name and province are required' });
    }
    const cleanRiverName = riverName.trim();
    const cleanProvince = province.trim().toUpperCase();
    if (cleanRiverName.length > MAX_NAME_LENGTH) {
      return res.status(400).json({ error: `River name must be at most ${MAX_NAME_LENGTH} characters` });
    }
    if (!PROVINCES.has(cleanProvince)) return res.status(400).json({ error: 'Invalid province' });
    if (!Array.isArray(stations) || stations.length === 0 || stations.length > MAX_RIVER_STATIONS) {
      return res.status(400).json({ error: `River must include between 1 and ${MAX_RIVER_STATIONS} stations` });
    }
    if (stations.some(station => station && (tooLong(station.stationName) || tooLong(station.section)
      || tooLong(station.latitude, MAX_COORDINATE_LENGTH) || tooLong(station.longitude, MAX_COORDINATE_LENGTH)))) {
      return res.status(400).json({ error: 'Station details are too long' });
    }

    const stationProvince = value => {
      const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
      return PROVINCES.has(code) ? code : cleanProvince;
    };
    const normalizedStations = [...new Map(stations
      .map(station => [station, station && typeof station.stationId === 'string' ? normalizeStationId(station.stationId.trim()) : null])
      .filter(([, id]) => id)
      .map(([station, id]) => [id, {
        stationId: id,
        stationName: typeof station.stationName === 'string' ? station.stationName : `Station ${id}`,
        province: stationProvince(station.province),
        latitude: typeof station.latitude === 'string' ? station.latitude : null,
        longitude: typeof station.longitude === 'string' ? station.longitude : null,
        section: typeof station.section === 'string' ? station.section : null
      }])).values()];
    if (normalizedStations.length === 0) return res.status(400).json({ error: 'River contains no valid station IDs' });

    const stationId = riverFavoriteId(cleanProvince, cleanRiverName);
    if (await overFavoriteLimit(userId.toString(), stationId)) {
      return res.status(409).json(limitError);
    }
    const favorite = await Favorite.findOneAndUpdate(
      { userId: userId.toString(), stationId, favoriteType: 'river' },
      {
        $set: {
          userId: userId.toString(),
          stationId,
          favoriteType: 'river',
          riverName: cleanRiverName,
          province: cleanProvince,
          stations: normalizedStations
        }
      },
      { upsert: true, new: true, runValidators: true }
    );

    return res.status(201).json({ message: 'River added to favorites', favorite });
  } catch (error) {
    console.error('Error adding river favorite:', error);
    return res.status(500).json({ error: 'Failed to add river to favorites' });
  }
};

exports.removeRiverFavorite = async (req, res) => {
  try {
    const userId = req.userId;
    const { favoriteId } = req.params;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });
    if (typeof favoriteId !== 'string' || !favoriteId.startsWith('river:')) {
      return res.status(400).json({ error: 'Valid river favorite ID is required' });
    }

    const result = await Favorite.findOneAndDelete({
      userId: userId.toString(),
      stationId: favoriteId,
      favoriteType: 'river'
    });
    if (!result) return res.status(404).json({ error: 'River favorite not found' });
    return res.json({ message: 'River removed from favorites' });
  } catch (error) {
    console.error('Error removing river favorite:', error);
    return res.status(500).json({ error: 'Failed to remove river from favorites' });
  }
};

exports.removeFavorite = async (req, res) => {
  try {
    const { stationId } = req.params;

    if (!stationId || typeof stationId !== 'string') {
      return res.status(400).json({ error: 'Valid station ID is required' });
    }
    const userId = req.userId;

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
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // River favorites are opt-in so clients that only understand stations keep working.
    const filter = req.query.includeRivers === 'true'
      ? { userId }
      : { userId, favoriteType: { $ne: 'river' } };
    const favorites = await Favorite.find(filter).sort({ createdAt: -1 });
    
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
    const userId = req.userId;

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