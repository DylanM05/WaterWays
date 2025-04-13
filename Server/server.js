const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const detailsRoute = require('./routes/DetailsRoute');
const scrapeRoute = require('./routes/ScrapeRoute');
const searchRoute = require('./routes/SearchRoute');
const secretRoute = require('./routes/SecretsRoute');
require('dotenv').config();

const app = express();
const port = 42069;


mongoose.connect('mongodb://localhost:27017/waterways').then(() => {
    console.log('Connected to MongoDB');
}).catch(err => {
    console.error('Error connecting to MongoDB', err);
});

app.use(express.json());
const allowedOrigins = [
  'https://waterways.dylansserver.top', 
  'http://localhost:3000', 
  'http://localhost:5173', 
  '66.79.243.222'
];

app.use(cors({
  origin: function(origin, callback) {

    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true
}));

app.use('/details', detailsRoute);
app.use('/work', scrapeRoute);
app.use('/search', searchRoute);
app.use('/api', secretRoute);

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
