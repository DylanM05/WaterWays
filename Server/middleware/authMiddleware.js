const { ClerkExpressWithAuth } = require('@clerk/clerk-sdk-node');
require('dotenv').config();

// This middleware will only verify the token, not block unauthorized requests
const verifyAuth = ClerkExpressWithAuth({
  publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
  secretKey: process.env.CLERK_SECRET_KEY,
});

// Use this middleware to access user data without blocking unauthorized requests
const getUserIfExists = (req, res, next) => {
  if (req.auth && req.auth.userId) {
    req.userId = req.auth.userId;
  }
  next();
};

// Middleware that enforces authentication and redirects unauthorized users
const requireAuth = (req, res, next) => {
  // First run the Clerk auth verification
  verifyAuth(req, res, (authError) => {
    if (authError || !req.auth || !req.auth.userId) {
      // Return a 401 with redirect information for the frontend to handle
      return res.status(401).json({
        error: 'Unauthorized',
        redirectTo: '/',
        message: 'You must be signed in to access this resource'
      });
    }
    
    // User is authenticated, proceed
    req.userId = req.auth.userId;
    next();
  });
};

module.exports = { verifyAuth, getUserIfExists, requireAuth };