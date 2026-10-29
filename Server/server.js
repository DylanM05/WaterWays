require('dotenv').config();
// Loaded first so error monitoring is running before anything else can fail.
const { Sentry, enabled: monitoringEnabled } = require('./utilities/monitoring');

const express = require('express');
const cors = require('cors');
const compression = require('compression');
const { connectWithRetry, databaseState } = require('./utilities/database');
const detailsRoute = require('./routes/DetailsRoute');
const searchRoute = require('./routes/SearchRoute');
const secretRoute = require('./routes/SecretsRoute');
const settingsRoute = require('./routes/settingsRoutes');
const { lenientLimiter } = require('./utilities/ratelimiter');
const loggingRoute = require('./routes/LoggingRoute');
const favoritesRoutes = require('./routes/favoritesRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');
const inviteRoutes = require('./routes/inviteRoutes');
const adminRoutes = require('./routes/adminRoutes');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

const app = express();

app.use(compression());

app.use((req, res, next) => {
  if (req.originalUrl === '/subscription/webhook') {
    let rawBody = '';
    req.on('data', (chunk) => {
      rawBody += chunk.toString();
    });
    req.on('end', () => {
      req.rawBody = rawBody;
      next();
    });
  } else {
    next();
  }
});

// Now define webhook route with special handling
app.post('/subscription/webhook', async (req, res) => {
  
  const signature = req.headers['stripe-signature'];
  
  try {
    const event = stripe.webhooks.constructEvent(
      req.rawBody, 
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
    if (event.type === 'checkout.session.completed') {
      const subscriptionController = require('./controllers/subscriptionController');
      const success = await subscriptionController.processWebhookEvent(event);
      
      if (success) {
      } else {
        console.error('❌ Failed to process webhook');
      }
    }
    
    return res.json({ received: true });
  } catch (err) {
    console.error('❌ Webhook Error:', err.message);
    return res.status(400).json({ 
      error: 'Webhook validation failed'
      });
  }
});

// Clerk (Svix) signs the exact request body, so this route must read it raw, before express.json().
app.post('/clerk/webhook', express.raw({ type: 'application/json' }), require('./controllers/clerkWebhookController').handleClerkWebhook);

app.set('trust proxy', 1);

if (!mongoUri) {
  // Retrying can't help without an address, so say clearly what's missing.
  console.error('MONGO_URI is not set, so the server has no database. Add it to Server/.env (in CI: the MONGO_URI secret).');
} else {
  connectWithRetry(mongoUri, {
    onConnected: () => {
      if (process.env.ENABLE_SCHEDULER !== 'false') {
        require('./utilities/scheduler').startScheduler().catch(error => {
          console.error('Unable to start hydrometric scheduler:', error);
        });
      }
    }
  });
}

app.use(express.json());
const allowedOrigins = [
  'https://water-ways.ca',
  'https://waterways.dylansserver.top',
  'https://backend.water-ways.ca',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost',
  'https://localhost',
  'capacitor://localhost',
  'ionic://localhost'
];

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Handle preflight requests
app.options('*', cors());
// The one general limit for every route below; routes add stricter limiters where needed.
app.use(lenientLimiter);
app.use('/details', detailsRoute);
app.use('/search', searchRoute);
app.use('/api', secretRoute);
app.use('/s', settingsRoute);
app.use('/l', loggingRoute);
app.use('/u/favorites', favoritesRoutes);
app.use('/sub', subscriptionRoutes);
app.use('/inv', inviteRoutes)

app.use('/admin', adminRoutes)

// Always 200 so the website container can start (docker-compose waits on this); the database state is reported.
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', database: mongoUri ? databaseState() : 'not configured' });
});

// Reports errors that reach Express without being handled by a route.
if (monitoringEnabled) Sentry.setupExpressErrorHandler(app);

const port = 42069;
app.listen(port, '0.0.0.0', () => {
  console.log(`Server is running on http://0.0.0.0:${port}`);
});
