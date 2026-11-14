require('dotenv').config();
// Loaded first so error monitoring is running before anything else can fail.
const { Sentry, enabled: monitoringEnabled } = require('./utilities/monitoring');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { connectWithRetry, databaseState } = require('./utilities/database');
const detailsRoute = require('./routes/DetailsRoute');
const searchRoute = require('./routes/SearchRoute');
const settingsRoute = require('./routes/settingsRoutes');
const { lenientLimiter, webhookLimiter } = require('./utilities/ratelimiter');
const { corsOptions } = require('./utilities/origins');
const { errorHandler } = require('./middleware/errorHandler');
const loggingRoute = require('./routes/LoggingRoute');
const favoritesRoutes = require('./routes/favoritesRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');
const inviteRoutes = require('./routes/inviteRoutes');
const adminRoutes = require('./routes/adminRoutes');

const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

const app = express();

app.disable('x-powered-by');
// The website reads this JSON API from another origin, so resources may be read cross-origin (CORS still decides who).
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(compression());

// Stripe signs the exact request body, so this route reads it raw (capped at 1 MB), before express.json().
const stripeWebhook = require('./controllers/stripeWebhookController');
app.post('/subscription/webhook', webhookLimiter, stripeWebhook.readBody, stripeWebhook.handleStripeWebhook);

// Clerk (Svix) signs the exact request body, so this route must read it raw, before express.json().
app.post('/clerk/webhook', webhookLimiter, express.raw({ type: 'application/json' }), require('./controllers/clerkWebhookController').handleClerkWebhook);

app.set('trust proxy', 1);

if (!mongoUri) {
  // Retrying can't help without an address, so say clearly what's missing.
  console.error('MONGO_URI is not set, so the server has no database. Add it to Server/.env (in CI: the MONGO_URI secret).');
} else {
  connectWithRetry(mongoUri, {
    onConnected: () => {
      // Background jobs: the water sync and roll-ups, and the Stripe membership sync.
      if (process.env.ENABLE_SCHEDULER !== 'false') {
        require('./utilities/scheduler').startScheduler().catch(error => {
          console.error('Unable to start hydrometric scheduler:', error);
        });
        require('./controllers/subscriptionController').startSubscriptionSync();
      }
    }
  });
}

app.use(express.json());

app.use(cors(corsOptions));
// The one general limit for every route below; routes add stricter limiters where needed.
app.use(lenientLimiter);
app.use('/details', detailsRoute);
app.use('/search', searchRoute);
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

// Last: a plain JSON error for anything unhandled, never a stack trace.
app.use(errorHandler);

const port = 42069;
app.listen(port, '0.0.0.0', () => {
  console.log(`Server is running on http://0.0.0.0:${port}`);
});
