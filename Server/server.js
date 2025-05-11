const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const detailsRoute = require('./routes/DetailsRoute');
const scrapeRoute = require('./routes/ScrapeRoute');
const searchRoute = require('./routes/SearchRoute');
const secretRoute = require('./routes/SecretsRoute');
const settingsRoute = require('./routes/settingsRoutes');
const { lenientLimiter } = require('./utilities/ratelimiter');
const loggingRoute = require('./routes/LoggingRoute');
const favoritesRoutes = require('./routes/favoritesRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');
const inviteRoutes = require('./routes/inviteRoutes');
const adminRoutes = require('./routes/adminRoutes');
const Admin = require('./models/Admin');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

require('dotenv').config();

const app = express();

// This must be the first middleware - nothing before it!
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
    // Add this code to actually process the event
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

// AFTER webhook route, add the rest of your middleware
app.set('trust proxy', 1);

mongoose.connect('mongodb://localhost:27017/waterways').then(() => {
    console.log('Connected to MongoDB');
}).catch(err => {
    console.error('Error connecting to MongoDB', err);
});

app.use(express.json());
const allowedOrigins = ['https://waterways.dylansserver.top', 'http://localhost:3000', '66.79.243.222'];

app.use(cors({
  origin: true,
  credentials: true
}));

app.use(lenientLimiter);
app.use('/details', detailsRoute);
app.use('/work', scrapeRoute);
app.use('/search', searchRoute);
app.use('/api', secretRoute);
app.use('/s', settingsRoute);
app.use('/l', loggingRoute);
app.use('/u/favorites', favoritesRoutes);
app.use('/sub', subscriptionRoutes);
app.use('/inv', inviteRoutes)

app.use('/admin', adminRoutes)

const port = 42069;
app.listen(port, '0.0.0.0', () => {
  console.log(`Server is running on http://0.0.0.0:${port}`);
});

