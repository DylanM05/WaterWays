require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const Favorite = require('../models/Favorite');
const { splitStationName } = require('../utilities/riverNames');
const { riverFavoriteId } = require('../controllers/favoritesController');

// River lists used to group stations by their first two words ("LITTLE QUALICUM"); they now use the
// waterbody name ("LITTLE QUALICUM RIVER"). This renames saved rivers to match, so apps still recognise them.
// Prints the changes by default; pass --apply to write them.
const apply = process.argv.includes('--apply');

function mostCommon(values) {
    const counts = new Map();
    for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

async function main() {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!mongoUri) throw new Error('MONGO_URI is not set');
    await mongoose.connect(mongoUri);

    const favorites = await Favorite.find({ favoriteType: 'river' }).lean();
    let renamed = 0;
    let merged = 0;

    for (const favorite of favorites) {
        const stations = favorite.stations.map(station => ({
            ...station,
            ...(station.stationName ? { section: splitStationName(station.stationName).section } : {})
        }));
        // An old group could mix several rivers ("SOUTH BRANCH"); name it after most of its stations.
        const riverName = mostCommon(favorite.stations
            .filter(station => station.stationName)
            .map(station => splitStationName(station.stationName).riverName));
        if (!riverName || riverName === favorite.riverName) continue;

        const stationId = riverFavoriteId(favorite.province, riverName);
        const duplicate = stationId !== favorite.stationId &&
            await Favorite.exists({ userId: favorite.userId, stationId });
        console.log(`${favorite.userId} ${favorite.province}: "${favorite.riverName}" -> "${riverName}"${duplicate ? ' (already saved; removing old copy)' : ''}`);

        if (!apply) continue;
        if (duplicate) {
            await Favorite.deleteOne({ _id: favorite._id });
            merged++;
        } else {
            await Favorite.updateOne({ _id: favorite._id }, { $set: { stationId, riverName, stations } });
            renamed++;
        }
    }

    console.log(apply
        ? `Renamed ${renamed} and removed ${merged} duplicate saved rivers.`
        : 'Dry run; pass --apply to write these changes.');
}

main()
    .catch(error => {
        console.error('River favorite migration failed:', error);
        process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
