const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const detailsRoute = require('./routes/DetailsRoute');
const scrapeRoute = require('./routes/ScrapeRoute');
const searchRoute = require('./routes/SearchRoute');
const secretRoute = require('./routes/SecretsRoute');
const Scheduler = require('./utilities/scheduler');
require('dotenv').config();

const app = express();
const port = 3000;

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/waterways').then(() => {
    console.log('Connected to MongoDB');
}).catch(err => {
    console.error('Error connecting to MongoDB', err);
});

app.use(express.json());
app.use(cors());

app.use('/details', detailsRoute);
app.use('/work', scrapeRoute);
app.use('/search', searchRoute);
app.use('/api', secretRoute);

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});