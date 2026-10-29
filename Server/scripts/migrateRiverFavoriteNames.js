require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const Favorite = require('../models/Favorite');
const StationCoordinates = require('../models/StationCoordinates');
const { splitStationName } = require('../utilities/riverNames');
const { riverFavoriteId } = require('../controllers/favoritesController');

// River lists used to group stations by their first two words ("LITTLE QUALICUM"); they now use the
// waterbody name ("LITTLE QUALICUM RIVER"). This renames saved rivers to match, so apps still recognise them.
// Station names come from the current station list, so it also catches stations renamed by the catalogue
// sync (run that first). Prints the changes by default; pass --apply to write them.

function mostCommon(values) {
    const counts = new Map();
    for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

/** Renames saved rivers to the names the river lists use now. Returns the planned or applied changes. */
async function migrateRiverFavorites({ apply = false } = {}) {
    const favorites = await Favorite.find({ favoriteType: 'river' }).lean();
    const stationIds = [...new Set(favorites.flatMap(favorite => favorite.stations.map(station => station.stationId)))];
    const currentNames = new Map((await StationCoordinates.find({ station_id: { $in: stationIds } }).lean())
        .map(station => [station.station_id, station.stationName]));
    const changes = [];

    for (const favorite of favorites) {
        const stations = favorite.stations.map(station => {
            const stationName = currentNames.get(station.stationId) || station.stationName;
            return stationName ? { ...station, stationName, section: splitStationName(stationName).section } : station;
        });
        // An old group could mix several rivers ("SOUTH BRANCH"); name it after most of its stations.
        const riverName = mostCommon(stations
            .filter(station => station.stationName)
            .map(station => splitStationName(station.stationName).riverName));
        if (!riverName || riverName === favorite.riverName) continue;

        const stationId = riverFavoriteId(favorite.province, riverName);
        const duplicate = stationId !== favorite.stationId &&
            Boolean(await Favorite.exists({ userId: favorite.userId, stationId }));
        changes.push({ userId: favorite.userId, province: favorite.province, from: favorite.riverName, to: riverName, duplicate });

        if (!apply) continue;
        if (duplicate) {
            await Favorite.deleteOne({ _id: favorite._id });
        } else {
            await Favorite.updateOne({ _id: favorite._id }, { $set: { stationId, riverName, stations } });
        }
    }
    return changes;
}

async function main() {
    const apply = process.argv.includes('--apply');
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!mongoUri) throw new Error('MONGO_URI is not set');
    await mongoose.connect(mongoUri);

    const changes = await migrateRiverFavorites({ apply });
    for (const change of changes) {
        console.log(`${change.userId} ${change.province}: "${change.from}" -> "${change.to}"${change.duplicate ? ' (already saved; removing old copy)' : ''}`);
    }
    console.log(changes.length === 0
        ? 'All saved rivers already match the current river names.'
        : apply
            ? `Renamed ${changes.filter(change => !change.duplicate).length} and removed ${changes.filter(change => change.duplicate).length} duplicate saved rivers.`
            : `${changes.length} saved river(s) to update. Dry run; pass --apply to write these changes.`);
}

if (require.main === module) {
    main()
        .catch(error => {
            console.error('River favorite migration failed:', error);
            process.exitCode = 1;
        })
        .finally(() => mongoose.disconnect());
}

module.exports = { migrateRiverFavorites };
