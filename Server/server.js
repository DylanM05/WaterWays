const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const detailsRoute = require('./routes/DetailsRoute');
const scrapeRoute = require('./routes/ScrapeRoute');
const searchRoute = require('./routes/SearchRoute');
const secretRoute = require('./routes/SecretsRoute');
const scheduler = require('./utilities/scheduler.js')
require('dotenv').config();

const app = express();
const port = 42069;


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


app.use('/details', detailsRoute);
app.use('/work', scrapeRoute);
app.use('/search', searchRoute);
app.use('/api', secretRoute);

app.listen(port, '0.0.0.0', () => {
  console.log(`Server is running on http://0.0.0.0:${port}`);
});

