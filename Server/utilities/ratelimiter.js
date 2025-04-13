const rateLimit = require('express-rate-limit');

// Default rate limiter - 100 requests per 15 minutes
const defaultLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: 'Too many requests from this IP, please try again after 15 minutes',
  skipSuccessfulRequests: false, // Count successful requests against the rate limit
});

// More strict limiter for sensitive endpoints - 30 requests per 15 minutes
const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Limit each IP to 30 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests for this sensitive endpoint, please try again after 15 minutes',
});

// Very lenient limiter for common public endpoints - 500 requests per 15 minutes
const lenientLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Limit each IP to 500 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again after 15 minutes',
});

module.exports = {
  defaultLimiter,
  strictLimiter,
  lenientLimiter
};