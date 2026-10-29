const axios = require('axios');
const StationCoordinates = require('../models/StationCoordinates');
const StationData = require('../models/StationData');
const StationArchive = require('../models/StationArchive');
const { fetchRealtimeData, upsertRealtimeData } = require('../utilities/hydrometricData');
const { cleanReadings } = require('../utilities/waterQuality');
const { splitStationName } = require('../utilities/riverNames');
const { formatDate, formatDateTime, formatTime } = require('../utilities/dateFormat');
const { HOUR_MS, readingsWithHourly } = require('../utilities/rollups');
require('dotenv').config();
const NodeCache = require('node-cache');
const waterDataCache = new NodeCache({ stdTTL: 900 }); // 15 minutes cache TTL


exports.getCoordinates = async (req, res) => {
  const stationId = req.params.id;

  try {
    const coordinates = await StationCoordinates.findOne({ station_id: stationId });
    if (coordinates) {
      res.json(coordinates);
    } else {
      res.status(404).json({ error: 'Coordinates not found' });
    }
  } catch (error) {
    console.error('Error fetching coordinates:', error);
    res.status(500).json({ error: 'Error fetching coordinates' });
  }
};

const weatherCodeMapping = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Drizzle: Light intensity',
  53: 'Drizzle: Moderate intensity',
  55: 'Drizzle: Dense intensity',
  56: 'Freezing Drizzle: Light intensity',
  57: 'Freezing Drizzle: Dense intensity',
  61: 'Rain: Slight intensity',
  63: 'Rain: Moderate intensity',
  65: 'Rain: Heavy intensity',
  66: 'Freezing Rain: Light intensity',
  67: 'Freezing Rain: Heavy intensity',
  71: 'Snow fall: Slight intensity',
  73: 'Snow fall: Moderate intensity',
  75: 'Snow fall: Heavy intensity',
  77: 'Snow grains',
  80: 'Rain showers: Slight intensity',
  81: 'Rain showers: Moderate intensity',
  82: 'Rain showers: Violent intensity',
  85: 'Snow showers: Slight intensity',
  86: 'Snow showers: Heavy intensity',
  95: 'Thunderstorm: Slight or moderate',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail'
};

const getCompassDirection = (degree) => {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(degree / 22.5) % 16;
  return directions[index];
};

// A station page asks for current, pressure, hourly and weekly weather at once, and forecasts change slowly.
const weatherCache = new NodeCache({ stdTTL: 15 * 60 });
const weatherRequests = new Map();

// The free Open-Meteo API is for non-commercial use; OPEN_METEO_API_KEY switches to a paid plan.
const OPEN_METEO_URL = process.env.OPEN_METEO_API_KEY
  ? 'https://customer-api.open-meteo.com/v1/forecast'
  : 'https://api.open-meteo.com/v1/forecast';

// Current conditions and pressure are reported in GMT; forecasts in the station's local time.
const WEATHER_QUERIES = {
  gmt: {
    current: 'temperature_2m,relative_humidity_2m,precipitation,rain,snowfall,showers,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,weather_code,apparent_temperature,is_day',
    hourly: 'surface_pressure,pressure_msl'
  },
  local: {
    hourly: 'temperature_2m,weather_code,relative_humidity_2m,apparent_temperature,precipitation_probability,precipitation,wind_speed_10m,wind_gusts_10m,wind_direction_10m,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,sunrise,sunset,daylight_duration,uv_index_max,uv_index_clear_sky_max,precipitation_sum,wind_speed_10m_max,rain_sum,showers_sum,snowfall_sum,precipitation_probability_max,wind_gusts_10m_max,wind_direction_10m_dominant',
    forecast_days: 7,
    timezone: 'auto'
  }
};
const HOURLY_FORECAST_HOURS = 3 * 24;

class StationNotFoundError extends Error {}

async function getStationWeather(stationId, kind) {
  const key = `${kind}:${stationId}`;
  const cached = weatherCache.get(key);
  if (cached) return cached;

  // Requests for the same station that arrive together share one upstream call.
  if (!weatherRequests.has(key)) {
    const request = (async () => {
      const coordinates = await StationCoordinates.findOne({ station_id: stationId }).lean();
      if (!coordinates) throw new StationNotFoundError();

      const params = {
        latitude: parseFloat(coordinates.latitude),
        longitude: parseFloat(coordinates.longitude),
        ...WEATHER_QUERIES[kind]
      };
      if (process.env.OPEN_METEO_API_KEY) params.apikey = process.env.OPEN_METEO_API_KEY;

      const { data } = await axios.get(OPEN_METEO_URL, { params, timeout: 10000 });
      weatherCache.set(key, data);
      return data;
    })().finally(() => weatherRequests.delete(key));
    weatherRequests.set(key, request);
  }
  return weatherRequests.get(key);
}

function sendWeatherError(res, error, message) {
  if (error instanceof StationNotFoundError) {
    return res.status(404).json({ error: 'Coordinates not found' });
  }
  console.error(`${message}:`, error);
  return res.status(500).json({ error: message });
}

exports.getWeather = async (req, res) => {
  const stationId = req.params.id;

  try {
    const currentData = (await getStationWeather(stationId, 'gmt')).current;
    if (!currentData) {
      return res.status(500).json({ error: 'Error fetching weather data' });
    }

    const weatherDescription = weatherCodeMapping[currentData.weather_code] || 'Unknown weather code';
    const windDirection = getCompassDirection(currentData.wind_direction_10m);
    const formattedTime = formatDateTime(currentData.time);

    // Calculate total precipitation from different sources
    const totalPrecipitation = (currentData.precipitation || 0) + 
                             (currentData.rain || 0) + 
                             (currentData.snowfall || 0) + 
                             (currentData.showers || 0);

    // Determine precipitation type
    let precipitationType = null;
    if (currentData.snowfall > 0) {
      precipitationType = 'snow';
    } else if ((currentData.rain || 0) > 0 || (currentData.showers || 0) > 0) {
      precipitationType = 'rain';
    }

    res.json({
      weather: weatherDescription,
      temperature: currentData.temperature_2m,
      apparentTemperature: currentData.apparent_temperature,
      humidity: currentData.relative_humidity_2m,
      precipitation: totalPrecipitation > 0 ? {
        total: totalPrecipitation,
        type: precipitationType,
        rain: currentData.rain || 0,
        snow: currentData.snowfall || 0,
        showers: currentData.showers || 0
      } : null,
      pressure: {
        msl: currentData.pressure_msl,
        surface: currentData.surface_pressure
      },
      wind: currentData.wind_speed_10m,
      windDirection: windDirection,
      windGusts: currentData.wind_gusts_10m,
      cloudCover: currentData.cloud_cover,
      isDay: currentData.is_day ?? (new Date().getHours() > 6 && new Date().getHours() < 20 ? 1 : 0),
      time: formattedTime
    });
  } catch (error) {
    sendWeatherError(res, error, 'Error fetching weather data');
  }
};

exports.getPressure = async (req, res) => {
  const stationId = req.params.id;

  try {
    const pressureData = (await getStationWeather(stationId, 'gmt')).hourly;
    if (!pressureData) {
      return res.status(500).json({ error: 'Error fetching pressure data' });
    }

    const formattedTimestamps = pressureData.time.map(formatDateTime);

    res.json({
      time: formattedTimestamps,
      surfacePressure: pressureData.surface_pressure,
      pressureMsl: pressureData.pressure_msl
    });
  } catch (error) {
    sendWeatherError(res, error, 'Error fetching pressure data');
  }
};

exports.getHourlyWeather = async (req, res) => {
  const stationId = req.params.id;

  try {
    const hourlyWeatherResponse = await getStationWeather(stationId, 'local');
    if (!hourlyWeatherResponse.hourly) {
      return res.status(500).json({ error: 'Error fetching hourly weather data' });
    }
    // The cached forecast covers the week; this view shows the first three days.
    const hourlyWeatherData = Object.fromEntries(
      Object.entries(hourlyWeatherResponse.hourly).map(([name, values]) => [name, values.slice(0, HOURLY_FORECAST_HOURS)])
    );

    const formattedTimestamps = hourlyWeatherData.time.map(formatDateTime);

    res.json({
      time: formattedTimestamps,
      temperature: hourlyWeatherData.temperature_2m,
      weatherCode: hourlyWeatherData.weather_code,
      relativeHumidity: hourlyWeatherData.relative_humidity_2m,
      apparentTemperature: hourlyWeatherData.apparent_temperature,
      precipitationProbability: hourlyWeatherData.precipitation_probability,
      rawTime: hourlyWeatherData.time,
      utcOffsetSeconds: hourlyWeatherResponse.utc_offset_seconds,
      timezone: hourlyWeatherResponse.timezone,
      precipitation: hourlyWeatherData.precipitation,
      windSpeed: hourlyWeatherData.wind_speed_10m,
      windGusts: hourlyWeatherData.wind_gusts_10m,
      windDirection: hourlyWeatherData.wind_direction_10m,
      isDay: hourlyWeatherData.is_day
    });
  } catch (error) {
    sendWeatherError(res, error, 'Error fetching hourly weather data');
  }
};

// The station list only changes when stations are re-imported.
const RIVERS_CACHE_TTL_SECONDS = 6 * 60 * 60;

exports.getRiversByProvince = async (req, res) => {
  const province = req.params.province.toUpperCase();
  const cacheKey = `rivers-${province}`;

  const cachedBody = waterDataCache.get(cacheKey);
  if (cachedBody) {
    res.type('application/json');
    return res.send(cachedBody);
  }

  try {
    const data = await StationCoordinates.find({ province: province }).lean();

    const groupedRivers = data.reduce((acc, item) => {
      const { riverName, section } = splitStationName(item.stationName);
      if (!acc[riverName]) {
        acc[riverName] = [];
      }
      acc[riverName].push({ section, ...item });
      return acc;
    }, {});

    const body = JSON.stringify(groupedRivers);
    waterDataCache.set(cacheKey, body, RIVERS_CACHE_TTL_SECONDS);
    res.type('application/json');
    res.send(body);
  } catch (error) {
    console.error('Error fetching rivers by province:', error);
    res.status(500).json({ error: 'Error fetching rivers by province' });
  }
};

exports.getWeeklyWeather = async (req, res) => {
  const stationId = req.params.id;

  try {
    const weeklyWeatherResponse = await getStationWeather(stationId, 'local');
    const dailyData = weeklyWeatherResponse.daily;
    if (!dailyData) {
      console.error('Error fetching weekly weather data: No daily data found');
      return res.status(500).json({ error: 'Error fetching weekly weather data' });
    }
    const formattedDates = dailyData.time.map(formatDate);
    const formattedSunrise = dailyData.sunrise.map(formatTime);
    const formattedSunset = dailyData.sunset.map(formatTime);
    const weatherDescriptions = dailyData.weather_code.map(code => weatherCodeMapping[code] || 'Unknown');

    res.json({
      dates: formattedDates,
      rawDates: dailyData.time,
      utcOffsetSeconds: weeklyWeatherResponse.utc_offset_seconds,
      timezone: weeklyWeatherResponse.timezone,
      weather: {
        codes: dailyData.weather_code,
        descriptions: weatherDescriptions
      },
      temperature: {
        max: dailyData.temperature_2m_max,
        min: dailyData.temperature_2m_min,
        units: weeklyWeatherResponse.daily_units.temperature_2m_max
      },
      apparentTemperature: {
        max: dailyData.apparent_temperature_max,
        min: dailyData.apparent_temperature_min,
        units: weeklyWeatherResponse.daily_units.apparent_temperature_max
      },
      sun: {
        sunrise: formattedSunrise,
        sunset: formattedSunset,
        rawSunrise: dailyData.sunrise,
        rawSunset: dailyData.sunset,
        daylightDuration: dailyData.daylight_duration.map(seconds => {
          const hours = Math.floor(seconds / 3600);
          const minutes = Math.floor((seconds % 3600) / 60);
          return `${hours}h ${minutes}m`;
        })
      },
      uv: {
        max: dailyData.uv_index_max,
        clearSkyMax: dailyData.uv_index_clear_sky_max
      },
      precipitation: {
        total: dailyData.precipitation_sum,
        rain: dailyData.rain_sum,
        showers: dailyData.showers_sum,
        snow: dailyData.snowfall_sum,
        probability: dailyData.precipitation_probability_max,
        units: {
          rain: weeklyWeatherResponse.daily_units.rain_sum,
          snow: weeklyWeatherResponse.daily_units.snowfall_sum
        }
      },
      wind: {
        maxSpeed: dailyData.wind_speed_10m_max,
        maxGusts: dailyData.wind_gusts_10m_max,
        dominantDirection: dailyData.wind_direction_10m_dominant,
        units: weeklyWeatherResponse.daily_units.wind_speed_10m_max
      }
    });
  } catch (error) {
    sendWeatherError(res, error, 'Error fetching weekly weather forecast');
  }
};

const LATEST_READING_CACHE_TTL_SECONDS = 2 * 60;
const MAX_BATCH_STATIONS = 100;

async function findLatestReading(stationId) {
  const cacheKey = `latest-${stationId}`;
  const cached = waterDataCache.get(cacheKey);
  if (cached) return cached;

  // Enough recent history (~12 hours) to judge whether the newest reading is a spike.
  const recent = await StationData.find({ station_id: stationId })
    .sort({ date_time: -1 })
    .limit(144)
    .select('station_id date_time water_level discharge')
    .lean();
  const record = cleanReadings(recent.reverse()).pop();
  if (!record) return null;

  const reading = {
    date_time: record.date_time.toISOString().slice(0, 19).replace('T', ' '),
    water_level: record.water_level ?? null,
    discharge: record.discharge ?? null,
    station_id: record.station_id
  };
  waterDataCache.set(cacheKey, reading, LATEST_READING_CACHE_TTL_SECONDS);
  return reading;
}

exports.getLatestWaterData = async (req, res) => {
  const stationId = req.params.id;

  try {
    const reading = await findLatestReading(stationId);
    if (!reading) {
      return res.status(404).json({ error: 'No data found for this station' });
    }
    return res.json(reading);
  } catch (error) {
    console.error('Error fetching latest water data:', error);
    return res.status(500).json({ error: 'Error fetching latest water data' });
  }
};

// GET /details/latest-water-data?ids=A,B,C returns { stationId: reading }; stations without data are left out.
exports.getLatestWaterDataBatch = async (req, res) => {
  const ids = [...new Set(String(req.query.ids || '').split(',').map(id => id.trim()).filter(Boolean))];
  if (!ids.length) {
    return res.status(400).json({ error: 'ids is required' });
  }
  if (ids.length > MAX_BATCH_STATIONS) {
    return res.status(400).json({ error: `At most ${MAX_BATCH_STATIONS} stations per request` });
  }

  try {
    const readings = await Promise.all(ids.map(findLatestReading));
    const body = {};
    ids.forEach((id, index) => {
      if (readings[index]) body[id] = readings[index];
    });
    return res.json(body);
  } catch (error) {
    console.error('Error fetching latest water data batch:', error);
    return res.status(500).json({ error: 'Error fetching latest water data' });
  }
};

// Realtime data syncs every 10 minutes, so a short cache saves repeat queries without hiding new readings for long.
const WATER_DATA_CACHE_TTL_SECONDS = 2 * 60;
// If the stored history starts this long after the requested start, fill it from the API.
const COVERAGE_TOLERANCE_MS = 6 * 60 * 60 * 1000;
// Some stations genuinely have less history upstream; don't refetch them on every request.
const API_FALLBACK_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const apiFallbackAttempts = new Map();

exports.getWaterData = async (req, res) => {
  const stationId = req.params.id;
  const parsedDays = Number.parseInt(req.params.days, 10);
  const days = Number.isFinite(parsedDays) ? Math.min(Math.max(1, parsedDays), 30) : 1;
  const cacheKey = `water-data-${stationId}-${days}`;

  const cachedBody = waterDataCache.get(cacheKey);
  if (cachedBody) {
    res.type('application/json');
    return res.send(cachedBody);
  }

  try {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
    // Five-minute readings are kept for a week; older parts of the range come from hourly figures.
    const [readings, hours] = await Promise.all([
      StationData.find({
        station_id: stationId,
        date_time: { $gte: startDate, $lte: endDate }
      })
        .select('-_id date_time water_level discharge')
        .sort({ date_time: 1 })
        .lean(),
      StationArchive.find({
        station_id: stationId,
        period: 'hourly',
        date_time: { $gte: new Date(startDate.getTime() - HOUR_MS / 2), $lte: endDate }
      })
        .select('-_id date_time water_level discharge water_level_min water_level_max discharge_min discharge_max')
        .sort({ date_time: 1 })
        .lean()
    ]);
    let records = readingsWithHourly(readings, hours);

    const firstStored = records[0]?.date_time;
    const missingHistory = !firstStored || firstStored - startDate > COVERAGE_TOLERANCE_MS;
    const lastAttempt = apiFallbackAttempts.get(stationId) || 0;
    if (missingHistory && Date.now() - lastAttempt > API_FALLBACK_COOLDOWN_MS) {
      apiFallbackAttempts.set(stationId, Date.now());
      try {
        // Only the stretch before the earliest stored reading; what's stored (including hourly figures) is kept.
        const gapEnd = firstStored || endDate;
        const fetched = (await fetchRealtimeData(stationId, startDate, gapEnd))
          .filter(reading => reading.date_time < gapEnd);
        if (fetched.length) {
          records = [...fetched, ...records];
          // Stored like any reading; the nightly roll-up turns ones older than a week into hourly figures.
          upsertRealtimeData(fetched).catch(error => {
            console.error(`Failed to store fallback water data for ${stationId}:`, error);
          });
        }
      } catch (error) {
        console.error(`Water data API fallback failed for ${stationId}:`, error.message);
      }
    }

    const body = JSON.stringify(cleanReadings(records).map(record => ({
      date_time: record.date_time.toISOString().slice(0, 19).replace('T', ' '),
      water_level: record.water_level ?? null,
      discharge: record.discharge ?? null,
      station_id: stationId,
      // Hourly figures (older than a week) also send the hour's range.
      ...('water_level_min' in record && {
        water_level_min: record.water_level_min,
        water_level_max: record.water_level_max,
        discharge_min: record.discharge_min,
        discharge_max: record.discharge_max
      })
    })));
    waterDataCache.set(cacheKey, body, WATER_DATA_CACHE_TTL_SECONDS);

    res.type('application/json');
    return res.send(body);
  } catch (error) {
    console.error('Error fetching water data:', error);
    res.status(500).json({ error: 'Failed to fetch water data' });
  }
};

exports.getArchivedWaterData = async (req, res) => {
  const { id: stationId, period } = req.params;
  if (!['daily', 'monthly'].includes(period)) {
    return res.status(400).json({ error: 'period must be daily or monthly' });
  }

  const filter = { station_id: stationId, period };
  for (const bound of ['from', 'to']) {
    if (!req.query[bound]) continue;
    const date = new Date(req.query[bound]);
    if (Number.isNaN(date.getTime())) {
      return res.status(400).json({ error: `Invalid ${bound} date` });
    }
    filter.date_time = filter.date_time || {};
    filter.date_time[bound === 'from' ? '$gte' : '$lte'] = date;
  }

  const requestedLimit = Number.parseInt(req.query.limit, 10) || 5000;
  const limit = Math.min(Math.max(requestedLimit, 1), 10000);

  try {
    const records = await StationArchive.find(filter)
      .sort({ date_time: -1 })
      .limit(limit)
      .lean();
    return res.json(records.map(record => ({
      ...record,
      date_time: record.date_time.toISOString().slice(0, 19).replace('T', ' ')
    })));
  } catch (error) {
    console.error('Error fetching archived water data:', error);
    return res.status(500).json({ error: 'Failed to fetch archived water data' });
  }
};