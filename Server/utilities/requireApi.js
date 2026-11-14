require('dotenv').config();
const crypto = require('crypto');

const requireApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({ error: 'API Key is missing' });
  }
  const expectedApiKey = process.env.LOGGING_API_KEY;

  if (!expectedApiKey) {
    console.error('LOGGING_API_KEY is not set in the environment variables.');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Compared in constant time; hashing first makes the lengths equal, as timingSafeEqual needs.
  const digest = value => crypto.createHash('sha256').update(String(value)).digest();
  if (!crypto.timingSafeEqual(digest(apiKey), digest(expectedApiKey))) {
    return res.status(403).json({ error: 'Invalid API Key' });
  }

  next();
};

module.exports = { requireApiKey };