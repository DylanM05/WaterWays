// Environment Canada marks missing readings with sentinels such as 99999, -99999 and -999, sometimes
// shifted by a datum correction (e.g. -99998.98). No Canadian gauge datum sits below -900 m or above
// 9,000 m, and no river comes near 90,000 m³/s, so anything outside these bounds is not a measurement.
const LEVEL_MIN = -900;
const LEVEL_MAX = 9000;
const DISCHARGE_LIMIT = 90000;

// Spike filter: compare each reading with the median of its neighbours (Hampel filter).
const NEIGHBOURS = 6;        // readings on each side; 30 minutes at the usual 5-minute interval
const MIN_NEIGHBOURS = 4;
const MAD_TO_SIGMA = 1.4826; // scales median absolute deviation to a standard-deviation estimate
const SPIKE_SIGMAS = 6;

function plausibleLevel(value) {
    return typeof value === 'number' && value > LEVEL_MIN && value < LEVEL_MAX ? value : null;
}

function plausibleDischarge(value) {
    return typeof value === 'number' && Math.abs(value) < DISCHARGE_LIMIT ? value : null;
}

function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function percentile(sorted, fraction) {
    return sorted[Math.min(sorted.length - 1, Math.floor(fraction * (sorted.length - 1)))];
}

/**
 * Flags isolated spikes in a time-ordered series. A step change (dam release, rapid rise) survives
 * because half of its neighbours move with it; a one-off glitch has no neighbours that agree.
 * Only deviations larger than the station's whole normal range count, so quantized or noisy
 * series are left alone.
 */
function spikeMask(values) {
    const present = values.filter(value => value !== null).sort((a, b) => a - b);
    const normalRange = present.length ? percentile(present, 0.99) - percentile(present, 0.01) : 0;

    return values.map((value, index) => {
        if (value === null) return false;

        const neighbours = [];
        for (let j = Math.max(0, index - NEIGHBOURS); j <= Math.min(values.length - 1, index + NEIGHBOURS); j++) {
            if (j !== index && values[j] !== null) neighbours.push(values[j]);
        }
        if (neighbours.length < MIN_NEIGHBOURS) return false;

        const centre = median(neighbours);
        const spread = median(neighbours.map(neighbour => Math.abs(neighbour - centre)));
        const limit = Math.max(
            SPIKE_SIGMAS * MAD_TO_SIGMA * spread,
            normalRange,
            Math.abs(centre) * 0.1,
            0.1
        );
        return Math.abs(value - centre) > limit;
    });
}

/**
 * Removes implausible values and isolated spikes from time-ordered readings. Readings left with no
 * values are dropped.
 */
function cleanReadings(records) {
    const levels = records.map(record => plausibleLevel(record.water_level));
    const discharges = records.map(record => plausibleDischarge(record.discharge));
    const levelSpikes = spikeMask(levels);
    const dischargeSpikes = spikeMask(discharges);

    return records
        .map((record, index) => ({
            ...record,
            water_level: levelSpikes[index] ? null : levels[index],
            discharge: dischargeSpikes[index] ? null : discharges[index]
        }))
        .filter(record => record.water_level !== null || record.discharge !== null);
}

module.exports = {
    DISCHARGE_LIMIT,
    LEVEL_MAX,
    LEVEL_MIN,
    cleanReadings,
    plausibleDischarge,
    plausibleLevel
};
