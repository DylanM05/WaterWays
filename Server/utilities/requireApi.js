require('dotenv').config();

const requireApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key']; // Or use another header like 'Authorization'

  if (!apiKey) {
    return res.status(401).json({ error: 'API Key is missing' });
  }

  // Retrieve the expected API key from environment variables
  const expectedApiKey = process.env.LOGGING_API_KEY;

  if (!expectedApiKey) {
    console.error('LOGGING_API_KEY is not set in the environment variables.');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  if (apiKey !== expectedApiKey) {
    return res.status(403).json({ error: 'Invalid API Key' });
  }

  next(); // API key is valid, proceed to the next middleware/route handler
};

module.exports = { requireApiKey };