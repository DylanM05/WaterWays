require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const axios = require('axios');
const mongoose = require('mongoose');
const Favorite = require('../models/Favorite');
const StationCoordinates = require('../models/StationCoordinates');

// Compares StationCoordinates with Environment Canada's official station catalogue. Prints the differences;
// with --apply, corrects station names and coordinates and records each station's real-time flag and status
// (the apps say "No live readings" for stations without a feed). Stations are never added or removed, since
// that changes river lists and saved favourites; those are listed for a manual decision, and two options act
// on them: --remove-discontinued deletes discontinued stations, and --add-reporting adds active real-time
// stations that aren't listed but sent readings in the last few hours.
const CATALOGUE_URL = 'https://api.weather.gc.ca/collections/hydrometric-stations/items';
const REALTIME_URL = 'https://api.weather.gc.ca/collections/hydrometric-realtime/items';
const COORDINATE_TOLERANCE_KM = 1;
const REPORTING_WINDOW_HOURS = 3;
// The catalogue also has stations located in US states; the apps list Canadian provinces and territories.
const PROVINCES = new Set(['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT']);
const OPTIONS = ['--apply', '--remove-discontinued', '--add-reporting'];
const USAGE = `Usage: node scripts/syncStationCatalogue.js [${OPTIONS.join('] [')}]`;

function distanceKm(latitude1, longitude1, latitude2, longitude2) {
    const radians = Math.PI / 180;
    const a = Math.sin((latitude2 - latitude1) * radians / 2) ** 2
        + Math.cos(latitude1 * radians) * Math.cos(latitude2 * radians) * Math.sin((longitude2 - longitude1) * radians / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(a));
}

async function fetchCatalogue() {
    const response = await axios.get(CATALOGUE_URL, { params: { limit: 10000, f: 'json' }, timeout: 120000 });
    const features = response.data?.features || [];
    if (features.length >= 10000) throw new Error('The catalogue has more than 10,000 stations; add paging.');
    return features;
}

/** Differences between our stations and the catalogue's features. */
function compareWithCatalogue(stations, features) {
    const catalogue = new Map(features.map(feature => [feature.properties.STATION_NUMBER, feature]));
    const listed = new Set(stations.map(station => station.station_id));
    const findings = { notInCatalogue: [], discontinued: [], noRealtimeFeed: [], renamed: [], moved: [], notListed: [], flags: [] };

    for (const station of stations) {
        const feature = catalogue.get(station.station_id);
        if (!feature) {
            findings.notInCatalogue.push(station);
            continue;
        }
        const { STATION_NAME: name, STATUS_EN: status, REAL_TIME: realtime } = feature.properties;
        if (status !== 'Active') findings.discontinued.push({ station, status });
        else if (!realtime) findings.noRealtimeFeed.push({ station });
        if (station.realtime !== Boolean(realtime) || station.catalogueStatus !== status) {
            findings.flags.push({ station, realtime: Boolean(realtime), catalogueStatus: status });
        }

        if (name && name.trim().toUpperCase() !== String(station.stationName || '').trim().toUpperCase()) {
            findings.renamed.push({ station, name: name.trim() });
        }
        const [longitude, latitude] = feature.geometry?.coordinates || [];
        if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
            const ourLatitude = Number.parseFloat(station.latitude);
            const ourLongitude = Number.parseFloat(station.longitude);
            const distance = Number.isFinite(ourLatitude) && Number.isFinite(ourLongitude)
                ? distanceKm(ourLatitude, ourLongitude, latitude, longitude)
                : Infinity;
            if (distance > COORDINATE_TOLERANCE_KM) findings.moved.push({ station, latitude, longitude, distance });
        }
    }

    for (const [stationId, feature] of catalogue) {
        if (!listed.has(stationId) && feature.properties.STATUS_EN === 'Active' && feature.properties.REAL_TIME) {
            const [longitude, latitude] = feature.geometry?.coordinates || [];
            findings.notListed.push({ stationId, name: feature.properties.STATION_NAME, province: feature.properties.PROV_TERR_STATE_LOC, latitude, longitude });
        }
    }
    return findings;
}

/** Writes the catalogue's names and coordinates to the stations that differ. */
async function applyCorrections(findings) {
    const updates = new Map();
    for (const { station, name } of findings.renamed) {
        updates.set(station._id, { ...updates.get(station._id), stationName: name });
    }
    for (const { station, latitude, longitude } of findings.moved) {
        updates.set(station._id, { ...updates.get(station._id), latitude: String(latitude), longitude: String(longitude) });
    }
    for (const { station, realtime, catalogueStatus } of findings.flags) {
        updates.set(station._id, { ...updates.get(station._id), realtime, catalogueStatus });
    }
    for (const [_id, update] of updates) {
        await StationCoordinates.updateOne({ _id }, { $set: update });
    }
    return updates.size;
}

/** Station numbers that sent a reading in the last few hours. */
async function fetchReportingStations(hours = REPORTING_WINDOW_HOURS, now = new Date()) {
    const start = new Date(now.getTime() - hours * 60 * 60 * 1000);
    const reporting = new Set();
    for (let offset = 0; ;) {
        const response = await axios.get(REALTIME_URL, {
            params: {
                f: 'json', skipGeometry: true, properties: 'STATION_NUMBER', limit: 10000, offset,
                datetime: `${start.toISOString()}/${now.toISOString()}`
            },
            timeout: 120000
        });
        const features = response.data?.features || [];
        for (const feature of features) reporting.add(feature.properties.STATION_NUMBER);
        if (features.length < 10000) return reporting;
        offset += features.length;
    }
}

/** Station records for unlisted active real-time stations that are reporting now. */
function stationsToAdd(findings, reporting) {
    return findings.notListed
        .filter(candidate => reporting.has(candidate.stationId) && PROVINCES.has(candidate.province)
            && Number.isFinite(candidate.latitude) && Number.isFinite(candidate.longitude) && candidate.name)
        .map(candidate => ({
            stationName: candidate.name.trim(),
            station_id: candidate.stationId,
            province: candidate.province,
            latitude: String(candidate.latitude),
            longitude: String(candidate.longitude),
            realtime: true,
            catalogueStatus: 'Active'
        }));
}

async function addStations(stations) {
    if (stations.length) await StationCoordinates.insertMany(stations);
    return stations.length;
}

async function removeDiscontinued(findings) {
    const ids = findings.discontinued.map(({ station }) => station._id);
    if (!ids.length) return 0;
    const result = await StationCoordinates.deleteMany({ _id: { $in: ids } });
    return result.deletedCount || 0;
}

const describe = station => `${station.station_id} ${station.stationName} (${station.province})`;

async function main() {
    const args = process.argv.slice(2);
    if (args.some(arg => !OPTIONS.includes(arg))) throw new Error(USAGE);
    const apply = args.includes('--apply');

    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!mongoUri) throw new Error('Set MONGO_URI or MONGODB_URI before running the catalogue sync.');
    await mongoose.connect(mongoUri);

    const [stations, features, reporting] = await Promise.all([StationCoordinates.find().lean(), fetchCatalogue(), fetchReportingStations()]);
    const findings = compareWithCatalogue(stations, features);
    console.log(`${stations.length} stations listed; ${features.length} in the catalogue.\n`);

    console.log(`Coordinates more than ${COORDINATE_TOLERANCE_KM} km from the catalogue: ${findings.moved.length}`);
    findings.moved.sort((a, b) => b.distance - a.distance).forEach(({ station, latitude, longitude, distance }) =>
        console.log(`  ${describe(station)}: ${station.latitude}, ${station.longitude} -> ${latitude}, ${longitude} (${Math.round(distance)} km)`));
    console.log(`\nRenamed in the catalogue: ${findings.renamed.length}`);
    findings.renamed.forEach(({ station, name }) => console.log(`  ${describe(station)} -> ${name}`));
    console.log(`\nNot in the catalogue (keep unless they never report): ${findings.notInCatalogue.length}`);
    findings.notInCatalogue.forEach(station => console.log(`  ${describe(station)}`));
    console.log(`\nDiscontinued (candidates to remove): ${findings.discontinued.length}`);
    findings.discontinued.forEach(({ station, status }) => console.log(`  ${describe(station)}: ${status}`));
    console.log(`\nActive but without a real-time feed, so they never show readings: ${findings.noRealtimeFeed.length}`);
    findings.noRealtimeFeed.forEach(({ station }) => console.log(`  ${describe(station)}`));
    const additions = stationsToAdd(findings, reporting);
    console.log(`\nActive real-time stations not listed: ${findings.notListed.length}; ${additions.length} sent readings in the last ${REPORTING_WINDOW_HOURS} hours (added by --add-reporting):`);
    additions.forEach(station => console.log(`  ${describe(station)}`));
    console.log(`\nReal-time flags and statuses to record: ${findings.flags.length}`);

    if (args.includes('--remove-discontinued') && findings.discontinued.length) {
        const ids = findings.discontinued.map(({ station }) => station.station_id);
        const saved = await Favorite.countDocuments({ $or: [{ stationId: { $in: ids } }, { 'stations.stationId': { $in: ids } }] });
        if (saved) console.log(`\nNote: ${saved} saved favourite(s) include a discontinued station; they keep their snapshot.`);
        console.log(`Removed ${await removeDiscontinued(findings)} discontinued station(s).`);
    }
    if (args.includes('--add-reporting')) {
        console.log(`\nAdded ${await addStations(additions)} station(s); the next sync starts collecting their readings.`);
    }
    if (apply) {
        const updated = await applyCorrections(findings);
        console.log(`\nUpdated ${updated} station(s).`);
    }
    if (args.length) {
        console.log('\nRestart the server (or deploy) to refresh cached river lists.');
    } else {
        console.log('\nDry run. --apply corrects names and coordinates and records the real-time flags; --remove-discontinued and --add-reporting act on the lists above.');
    }
}

if (require.main === module) {
    main()
        .catch(error => {
            console.error(error.message);
            process.exitCode = 1;
        })
        .finally(() => mongoose.disconnect());
}

module.exports = { addStations, applyCorrections, compareWithCatalogue, distanceKm, fetchReportingStations, removeDiscontinued, stationsToAdd };
