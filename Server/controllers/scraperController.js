const { syncStationRealtime } = require('../utilities/hydrometricData');

exports.scrapeData = async (req, res) => {
    const { stationId } = req.body;

    if (typeof stationId !== 'string' || !stationId.trim()) {
        return res.status(400).json({ error: 'stationId is required' });
    }

    try {
        const { records } = await syncStationRealtime(stationId.trim(), 36);
        const data = records.map(({ date_time, water_level, discharge, station_id }) => ({
            date_time: date_time.toISOString().slice(0, 19).replace('T', ' '),
            water_level,
            discharge,
            station_id
        }));
        res.json(data);
    } catch (error) {
        console.error(`Error syncing Station ${stationId}:`, error);
        res.status(500).json({ error: `Error syncing Station ${stationId}` });
    }
};