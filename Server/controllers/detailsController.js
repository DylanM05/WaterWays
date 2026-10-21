const axios = require('axios');
const moment = require('moment');
const StationCoordinates = require('../models/StationCoordinates');
const StationData = require('../models/StationData');
const StationArchive = require('../models/StationArchive');
const { fetchRealtimeData, upsertRealtimeData } = require('../utilities/hydrometricData');
const { cleanReadings } = require('../utilities/waterQuality');
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

exports.getWeather = async (req, res) => {
  const stationId = req.params.id;

  try {
    const coordinates = await StationCoordinates.findOne({ station_id: stationId });
    if (!coordinates) {
      return res.status(404).json({ error: 'Coordinates not found' });
    }

    const { latitude, longitude } = coordinates;
    const weatherResponse = await axios.get(`https://api.open-meteo.com/v1/forecast`, {
      params: {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        current: 'temperature_2m,relative_humidity_2m,precipitation,rain,snowfall,showers,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,weather_code,apparent_temperature'
      }
    });
    const currentData = weatherResponse.data.current;
    if (!currentData) {
      return res.status(500).json({ error: 'Error fetching weather data' });
    }

    const weatherDescription = weatherCodeMapping[currentData.weather_code] || 'Unknown weather code';
    const windDirection = getCompassDirection(currentData.wind_direction_10m);
    const formattedTime = moment(currentData.time).format('MMMM Do YYYY, h:mm:ss a');

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
      isDay: currentData.is_day || (new Date().getHours() > 6 && new Date().getHours() < 20 ? 1 : 0),
      time: formattedTime
    });
  } catch (error) {
    console.error('Error fetching weather data:', error);
    res.status(500).json({ error: 'Error fetching weather data' });
  }
};

exports.getPressure = async (req, res) => {
  const stationId = req.params.id;

  try {
    const coordinates = await StationCoordinates.findOne({ station_id: stationId });
    if (!coordinates) {
      return res.status(404).json({ error: 'Coordinates not found' });
    }

    const { latitude, longitude } = coordinates;

    const pressureResponse = await axios.get(`https://api.open-meteo.com/v1/forecast`, {
      params: {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        hourly: 'surface_pressure,pressure_msl'
      }
    });

    const pressureData = pressureResponse.data.hourly;
    if (!pressureData) {
      return res.status(500).json({ error: 'Error fetching pressure data' });
    }

    const formattedTimestamps = pressureData.time.map(timestamp => moment(timestamp).format('MMMM Do YYYY, h:mm:ss a'));

    res.json({
      time: formattedTimestamps,
      surfacePressure: pressureData.surface_pressure,
      pressureMsl: pressureData.pressure_msl
    });
  } catch (error) {
    console.error('Error fetching pressure data:', error);
    res.status(500).json({ error: 'Error fetching pressure data' });
  }
};

exports.getHourlyWeather = async (req, res) => {
  const stationId = req.params.id;

  try {
    const coordinates = await StationCoordinates.findOne({ station_id: stationId });
    if (!coordinates) {
      return res.status(404).json({ error: 'Coordinates not found' });
    }

    const { latitude, longitude } = coordinates;

    const hourlyWeatherResponse = await axios.get(`https://api.open-meteo.com/v1/forecast`, {
      params: {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        hourly: 'temperature_2m,weather_code,relative_humidity_2m,apparent_temperature,precipitation_probability,precipitation,wind_speed_10m,wind_gusts_10m,wind_direction_10m,is_day',
        forecast_days: 3,
        // Return times in the station's local time zone instead of GMT.
        timezone: 'auto'
      }
    });

    const hourlyWeatherData = hourlyWeatherResponse.data.hourly;
    if (!hourlyWeatherData) {
      return res.status(500).json({ error: 'Error fetching hourly weather data' });
    }

    const formattedTimestamps = hourlyWeatherData.time.map(timestamp => moment(timestamp).format('MMMM Do YYYY, h:mm:ss a'));

    res.json({
      time: formattedTimestamps,
      temperature: hourlyWeatherData.temperature_2m,
      weatherCode: hourlyWeatherData.weather_code,
      relativeHumidity: hourlyWeatherData.relative_humidity_2m,
      apparentTemperature: hourlyWeatherData.apparent_temperature,
      precipitationProbability: hourlyWeatherData.precipitation_probability,
      rawTime: hourlyWeatherData.time,
      utcOffsetSeconds: hourlyWeatherResponse.data.utc_offset_seconds,
      timezone: hourlyWeatherResponse.data.timezone,
      precipitation: hourlyWeatherData.precipitation,
      windSpeed: hourlyWeatherData.wind_speed_10m,
      windGusts: hourlyWeatherData.wind_gusts_10m,
      windDirection: hourlyWeatherData.wind_direction_10m,
      isDay: hourlyWeatherData.is_day
    });
  } catch (error) {
    console.error('Error fetching hourly weather data:', error);
    res.status(500).json({ error: 'Error fetching hourly weather data' });
  }
};

exports.getRiversByProvince = async (req, res) => {
  const province = req.params.province.toUpperCase();

  try {
    const data = await StationCoordinates.find({ province: province });

    const groupedRivers = data.reduce((acc, item) => {
      const mainName = item.stationName.split(' ').slice(0, 2).join(' ');
      const section = item.stationName.split(' ').slice(2).join(' ');
      if (!acc[mainName]) {
        acc[mainName] = [];
      }
      acc[mainName].push({ section, ...item._doc });
      return acc;
    }, {});

    res.json(groupedRivers);
  } catch (error) {
    console.error('Error fetching rivers by province:', error);
    res.status(500).json({ error: 'Error fetching rivers by province' });
  }
};

exports.getWeeklyWeather = async (req, res) => {
  const stationId = req.params.id;

  try {
    const coordinates = await StationCoordinates.findOne({ station_id: stationId });
    if (!coordinates) {
      return res.status(404).json({ error: 'Coordinates not found' });
    }

    const { latitude, longitude } = coordinates;
  
    const weeklyWeatherResponse = await axios.get(`https://api.open-meteo.com/v1/forecast`, {
      params: {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,sunrise,sunset,daylight_duration,uv_index_max,uv_index_clear_sky_max,precipitation_sum,wind_speed_10m_max,rain_sum,showers_sum,snowfall_sum,precipitation_probability_max,wind_gusts_10m_max,wind_direction_10m_dominant',
        forecast_days: 7,
        // Local days and sunrise/sunset times instead of GMT.
        timezone: 'auto'
      }
    });

    const dailyData = weeklyWeatherResponse.data.daily;
    if (!dailyData) {
      console.error('Error fetching weekly weather data: No daily data found');
      return res.status(500).json({ error: 'Error fetching weekly weather data' });
    }
    const formattedDates = dailyData.time.map(date => moment(date).format('MMMM Do YYYY'));
    const formattedSunrise = dailyData.sunrise.map(time => moment(time).format('h:mm a'));
    const formattedSunset = dailyData.sunset.map(time => moment(time).format('h:mm a'));
    const weatherDescriptions = dailyData.weather_code.map(code => weatherCodeMapping[code] || 'Unknown');

    res.json({
      dates: formattedDates,
      rawDates: dailyData.time,
      utcOffsetSeconds: weeklyWeatherResponse.data.utc_offset_seconds,
      timezone: weeklyWeatherResponse.data.timezone,
      weather: {
        codes: dailyData.weather_code,
        descriptions: weatherDescriptions
      },
      temperature: {
        max: dailyData.temperature_2m_max,
        min: dailyData.temperature_2m_min,
        units: weeklyWeatherResponse.data.daily_units.temperature_2m_max
      },
      apparentTemperature: {
        max: dailyData.apparent_temperature_max,
        min: dailyData.apparent_temperature_min,
        units: weeklyWeatherResponse.data.daily_units.apparent_temperature_max
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
          rain: weeklyWeatherResponse.data.daily_units.rain_sum,
          snow: weeklyWeatherResponse.data.daily_units.snowfall_sum
        }
      },
      wind: {
        maxSpeed: dailyData.wind_speed_10m_max,
        maxGusts: dailyData.wind_gusts_10m_max,
        dominantDirection: dailyData.wind_direction_10m_dominant,
        units: weeklyWeatherResponse.data.daily_units.wind_speed_10m_max
      }
    });
  } catch (error) {
    console.error('Error fetching weekly weather forecast:', error);
    res.status(500).json({ error: 'Error fetching weekly weather forecast' });
  }
};

exports.getLatestWaterData = async (req, res) => {
  const stationId = req.params.id;

  try {
    // Enough recent history (~12 hours) to judge whether the newest reading is a spike.
    const recent = await StationData.find({ station_id: stationId })
      .sort({ date_time: -1 })
      .limit(144)
      .select('station_id date_time water_level discharge')
      .lean();
    const record = cleanReadings(recent.reverse()).pop();

    if (!record) {
      return res.status(404).json({ error: 'No data found for this station' });
    }

    return res.json({
      date_time: moment.utc(record.date_time).format('YYYY-MM-DD HH:mm:ss'),
      water_level: record.water_level ?? null,
      discharge: record.discharge ?? null,
      station_id: record.station_id
    });
  } catch (error) {
    console.error('Error fetching latest water data:', error);
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
    let records = await StationData.find({
      station_id: stationId,
      date_time: { $gte: startDate, $lte: endDate }
    })
      .select('-_id date_time water_level discharge')
      .sort({ date_time: 1 })
      .lean();

    const missingHistory = !records.length || records[0].date_time - startDate > COVERAGE_TOLERANCE_MS;
    const lastAttempt = apiFallbackAttempts.get(stationId) || 0;
    if (missingHistory && Date.now() - lastAttempt > API_FALLBACK_COOLDOWN_MS) {
      apiFallbackAttempts.set(stationId, Date.now());
      try {
        const fetched = await fetchRealtimeData(stationId, startDate, endDate);
        if (fetched.length > records.length) {
          records = fetched;
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
      station_id: stationId
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