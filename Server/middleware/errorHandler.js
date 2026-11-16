const http = require('http');

// The last middleware: answers any error with a plain JSON message, never a stack trace. Client errors
// such as body-parser's (400 malformed JSON, 413 body too large) keep their status; anything else is a 500.
const errorHandler = (err, req, res, next) => {
  const status = err.status >= 400 && err.status < 500 ? err.status : 500;
  if (status === 500) console.error('Unhandled error:', err);
  if (res.headersSent) return next(err);
  res.status(status).json({ error: http.STATUS_CODES[status] });
};

// After every route: an unknown address gets a JSON 404 like the rest of the API, not Express's HTML page.
const notFound = (req, res) => res.status(404).json({ error: http.STATUS_CODES[404] });

module.exports = { errorHandler, notFound };
