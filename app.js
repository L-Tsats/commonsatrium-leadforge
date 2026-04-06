// app.js — LeadForge production entry point (Plesk Node.js app)
// Serves the React SPA from public/ and all /api/* routes

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const { requireAuth } = require('./server/auth');

const app = express();

// ─── CORS (development flexibility) ──────────────────────────────────────────
app.use(cors({ origin: true, credentials: true }));

// ─── Body parsing ────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Session configuration ───────────────────────────────────────────────────
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  console.warn('WARNING: SESSION_SECRET not set — using insecure fallback (dev only)');
}

app.use(session({
  secret: sessionSecret || 'leadforge-dev-fallback-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // set to true behind HTTPS reverse proxy if needed
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// ─── Static files — serve built React app from public/ ───────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─── API routes ──────────────────────────────────────────────────────────────
app.use('/api/auth', require('./server/routes/auth'));
app.use('/api/leads', requireAuth, require('./server/routes/leads'));
app.use('/api/templates', requireAuth, require('./server/routes/templates'));
app.use('/api/assets', requireAuth, require('./server/routes/assets'));
app.use('/api/email', requireAuth, require('./server/routes/email'));
app.use('/api/backup', requireAuth, require('./server/routes/backup'));
app.use('/api/domains', requireAuth, require('./server/routes/domains'));
app.use('/api', requireAuth, require('./server/routes/proxy'));

// ─── SPA fallback — serve index.html for client-side routes ──────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start server ────────────────────────────────────────────────────────────
async function start() {
  // Run database migrations on startup
  try {
    const runMigrations = require('./server/migrate');
    await runMigrations();
    console.log('Database migrations completed');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`LeadForge running on port ${PORT} (Node ${process.version})`);
  });
}

start();

module.exports = app;
