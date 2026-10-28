const { clerkMiddleware, getAuth } = require('@clerk/express');
require('dotenv').config();

const clerk = clerkMiddleware({
  publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
  secretKey: process.env.CLERK_SECRET_KEY,
});

// Verifies the session token without blocking signed-out requests. Signed-in requests get
// req.userId and req.sessionClaims; controllers read those rather than Clerk's req.auth.
const verifyAuth = (req, res, next) => {
  clerk(req, res, (error) => {
    if (error) {
      // Treat the request as signed out; protected routes still answer 401 below.
      console.error('Clerk authentication failed:', error);
      return next();
    }
    const auth = getAuth(req);
    if (auth.userId) {
      req.userId = auth.userId;
      req.sessionClaims = auth.sessionClaims;
    }
    next();
  });
};

// Use this on routes that need a signed-in user.
const requireAuth = (req, res, next) => {
  verifyAuth(req, res, () => {
    if (!req.userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        redirectTo: '/',
        message: 'You must be signed in to access this resource'
      });
    }
    next();
  });
};

module.exports = { verifyAuth, requireAuth };
