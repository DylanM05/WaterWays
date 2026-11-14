// Web origins that may call the API with credentials (CORS) and whose Clerk session tokens are accepted (azp).
const production = process.env.NODE_ENV === 'production';

const webOrigins = [
  'https://water-ways.ca',
  'https://waterways.dylansserver.top',
  'https://backend.water-ways.ca',
  // The redesign's test build.
  'https://beta.water-ways.ca',
  // Local development builds; never allowed in production.
  ...(production ? [] : ['http://localhost:3000', 'http://localhost:5173', 'http://localhost', 'https://localhost']),
  // More origins, comma separated, without a code change (for example a preview build's address).
  ...(process.env.EXTRA_CORS_ORIGINS || '').split(',').map(origin => origin.trim()).filter(Boolean)
];

const corsOptions = {
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    // Other origins get no CORS headers, so the browser keeps the response from the page.
    callback(null, webOrigins.includes(origin));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

module.exports = { webOrigins, corsOptions };
