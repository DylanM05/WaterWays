require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const axios = require('axios');
const mongoose = require('mongoose');
const StationCoordinates = require('../models/StationCoordinates');

// Compares StationCoordinates with Environment Canada's official station catalogue. Prints the differences;
// with --apply, corrects station names and coordinates from the catalogue. Stations are never added or
// removed, since that changes river lists and saved favourites; those are listed for a manual decision.
const CATALOGUE_URL = 'https://api.weather.gc.ca/collections/hydrometric-stations/items';
const COORDINATE_TOLERANCE_KM = 1;
const USAGE = 'Usage: node scripts/syncStationCatalogue.js [--apply]';

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
    const findings = { notInCatalogue: [], discontinued: [], noRealtimeFeed: [], renamed: [], moved: [], notListed: [] };

    for (const station of stations) {
        const feature = catalogue.get(station.station_id);
        if (!feature) {
            findings.notInCatalogue.push(station);
            continue;
        }
        const { STATION_NAME: name, STATUS_EN: status, REAL_TIME: realtime } = feature.properties;
        if (status !== 'Active') findings.discontinued.push({ station, status });
        else if (!realtime) findings.noRealtimeFeed.push({ station });

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
            findings.notListed.push({ stationId, name: feature.properties.STATION_NAME, province: feature.properties.PROV_TERR_STATE_LOC });
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
    for (const [_id, update] of updates) {
        await StationCoordinates.updateOne({ _id }, { $set: update });
    }
    return updates.size;
}

const describe = station => `${station.station_id} ${station.stationName} (${station.province})`;

async function main() {
    const args = process.argv.slice(2);
    if (args.some(arg => arg !== '--apply')) throw new Error(USAGE);
    const apply = args.includes('--apply');

    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!mongoUri) throw new Error('Set MONGO_URI or MONGODB_URI before running the catalogue sync.');
    await mongoose.connect(mongoUri);

    const [stations, features] = await Promise.all([StationCoordinates.find().lean(), fetchCatalogue()]);
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
    console.log(`\nActive real-time stations not listed (candidates to add): ${findings.notListed.length}`);

    if (apply) {
        const updated = await applyCorrections(findings);
        console.log(`\nUpdated names and coordinates for ${updated} station(s). Restart the server to refresh cached river lists.`);
    } else {
        console.log('\nDry run; pass --apply to correct names and coordinates.');
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

module.exports = { applyCorrections, compareWithCatalogue, distanceKm };
