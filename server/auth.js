// server/auth.js — Authentication middleware
// Provides requireAuth middleware that checks for a valid session

/**
 * Express middleware that requires an authenticated session.
 * Returns 401 JSON if req.session.userId is not set.
 */
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

module.exports = { requireAuth };
