const axios = require('axios');
const moment = require('moment');
const cheerio = require('cheerio');
const StationCoordinates = require('../models/StationCoordinates');
const StationData = require('../models/StationData');
require('dotenv').config();
const fs = require('fs');
const { parseDocument } = require('htmlparser2');
const { findOne, getText, getAttributeValue, getChildren } = require('domutils');
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
        hourly: 'temperature_2m,weather_code,relative_humidity_2m,apparent_temperature,precipitation_probability',
        forecast_days: 3
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
      precipitationProbability: hourlyWeatherData.precipitation_probability
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
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,sunrise,sunset,daylight_duration,uv_index_max,uv_index_clear_sky_max,precipitation_sum,wind_speed_10m_max,rain_sum,showers_sum,snowfall_sum',
        forecast_days: 7
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
        units: {
          rain: weeklyWeatherResponse.data.daily_units.rain_sum,
          snow: weeklyWeatherResponse.data.daily_units.snowfall_sum
        }
      },
      wind: {
        maxSpeed: dailyData.wind_speed_10m_max,
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
  console.log(`Fetching latest water data for station: ${stationId}`);

  try {
    // Correctly create date objects
    const today = new Date();
    // Create startDate as yesterday
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 1);

    const formattedDate = today.toISOString().split('T')[0];
    const formattedStartDate = startDate.toISOString().split('T')[0];

    const url = `https://wateroffice.ec.gc.ca/report/real_time_e.html?stn=${stationId}&mode=Table&startDate=${formattedStartDate}&endDate=${formattedDate}`;

    const response = await fetch(url, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'max-age=0',
        'Connection': 'keep-alive',
        'Cookie': 'PHPSESSID=a594f5b05015291d18eb70adc1aa2f78; disclaimer=agree',
        'Referer': url,
        'Upgrade-Insecure-Requests': '1',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      }
    });
    
    // Rest of your function remains the same
    const html = await response.text();

    // Use cheerio for parsing - EXACT SAME as getWaterData
    const $ = cheerio.load(html);
    
    const data = [];
    $('table').each(function() {
      const captionText = $(this).find('caption').text();
      if (captionText.includes('real-time data in tabular format')) {
        $(this).find('tbody tr').each(function() {
          const cells = $(this).find('td');
          if (cells.length >= 6) {
            const date_time = $(cells[0]).text().trim();
            
            // Get water level - EXACT SAME as getWaterData
            let water_level = $(cells[1]).attr('data-order') || $(cells[1]).text().trim();
            if (water_level && water_level !== '-') {
              water_level = parseFloat(water_level);
              if (isNaN(water_level)) water_level = null;
            } else {
              water_level = null;
            }
            
            // Get discharge - EXACT SAME as getWaterData
            let discharge = $(cells[5]).attr('data-order') || $(cells[5]).text().trim();
            if (discharge && discharge !== '-') {
              discharge = parseFloat(discharge);
              if (isNaN(discharge)) discharge = null;
            } else {
              discharge = null;
            }
            
            if (date_time) {
              data.push({ date_time, water_level, discharge, station_id: stationId });
            }
          }
        });
        return false; 
      }
    });
    
    // Return only the latest entry
    if (data.length > 0) {
      // Sort by date in descending order and take the first one
      const sortedData = data.sort((a, b) => new Date(b.date_time) - new Date(a.date_time));
      const latestData = sortedData[0];
      return res.json(latestData);
    } else {
      return res.status(404).json({ error: 'No data found for this station' });
    }
  } catch (error) {
    console.error('Error fetching latest water data:', error);
    return res.status(500).json({ error: 'Error fetching latest water data' });
  }
};

exports.getWaterData = async (req, res) => {
  const stationId = req.params.id;
  const days = parseInt(req.params.days, 10) || 1;
  
  try {
    // No cache check - always fetch fresh data
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const formattedEndDate = endDate.toISOString().split('T')[0];
    const formattedStartDate = startDate.toISOString().split('T')[0];

    const url = `https://wateroffice.ec.gc.ca/report/real_time_e.html?stn=${stationId}&mode=Table&startDate=${formattedStartDate}&endDate=${formattedEndDate}`;

    const response = await fetch(url, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'max-age=0',
        'Connection': 'keep-alive',
        'Cookie': 'PHPSESSID=a594f5b05015291d18eb70adc1aa2f78; disclaimer=agree',
        'Referer': url,
        'Upgrade-Insecure-Requests': '1',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      }
    });
    const html = await response.text();
    
    // Use cheerio for parsing
    const $ = cheerio.load(html);
    
    const data = [];
    $('table').each(function() {
      const captionText = $(this).find('caption').text();
      if (captionText.includes('real-time data in tabular format')) {
        $(this).find('tbody tr').each(function() {
          const cells = $(this).find('td');
          if (cells.length >= 6) {
            const date_time = $(cells[0]).text().trim();
            
            // Get water level
            let water_level = $(cells[1]).attr('data-order') || $(cells[1]).text().trim();
            if (water_level && water_level !== '-') {
              water_level = parseFloat(water_level);
              if (isNaN(water_level)) water_level = null;
            } else {
              water_level = null;
            }
            
            // Get discharge
            let discharge = $(cells[5]).attr('data-order') || $(cells[5]).text().trim();
            if (discharge && discharge !== '-') {
              discharge = parseFloat(discharge);
              if (isNaN(discharge)) discharge = null;
            } else {
              discharge = null;
            }
            
            if (date_time) {
              data.push({ date_time, water_level, discharge, station_id: stationId });
            }
          }
        });
        return false; // Break the loop
      }
    });
    
    // No caching - directly return the data
    return res.json(data);
  } catch (error) {
    console.error('Error fetching water data:', error);
    res.status(500).json({ error: 'Failed to fetch water data' });
  }
};