const mongoose = require('mongoose');

/**
 * Connects to MongoDB, retrying until it succeeds. Mongoose doesn't retry a failed first connection, so
 * one failed attempt at startup (say, the database restarting) would leave every request timing out until
 * the server was restarted. Once connected, the driver reconnects by itself after later drops.
 */
async function connectWithRetry(uri, {
  onConnected = () => {},
  connect = target => mongoose.connect(target),
  delayFor = attempt => Math.min(30, 5 * attempt) * 1000,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms))
} = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      await connect(uri);
      console.log(attempt === 1 ? 'Connected to MongoDB' : `Connected to MongoDB after ${attempt} attempts`);
      await onConnected();
      return attempt;
    } catch (error) {
      const delay = delayFor(attempt);
      console.error(`MongoDB connection attempt ${attempt} failed; retrying in ${delay / 1000}s: ${error.message}`);
      await wait(delay);
    }
  }
}

const STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];
const databaseState = () => STATES[mongoose.connection.readyState] || 'unknown';

module.exports = { connectWithRetry, databaseState };
