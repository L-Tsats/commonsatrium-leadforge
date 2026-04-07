// server/routes/auth.js — Authentication routes
// POST /login, POST /logout, GET /me

const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db');

const router = express.Router();

// POST /api/auth/login — validate credentials, create session
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const [rows] = await pool.execute(
      'SELECT id, username, password_hash, display_name FROM users WHERE username = ?',
      [username]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    req.session.userId = user.id;
    req.session.username = user.username;

    res.json({ username: user.username, displayName: user.display_name });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/register — create a new user (admin only)
router.post('/register', async (req, res) => {
  if (!req.session || !req.session.userId || req.session.username !== 'admin') {
    return res.status(403).json({ error: 'Only admin can create accounts' });
  }
  try {
    const { username, password, displayName } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }
    const [existing] = await pool.execute('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Username already exists' });
    }
    const hash = await bcrypt.hash(password, 10);
    await pool.execute(
      'INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)',
      [username, hash, displayName || username]
    );
    res.json({ ok: true, username });
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/users — list all users (requires auth)
router.get('/users', async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const [rows] = await pool.execute('SELECT id, username, display_name, created_at FROM users');
    res.json({ users: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/logout — destroy session
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err.message);
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

// GET /api/auth/me — return current user info or 401
router.get('/me', async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const [rows] = await pool.execute(
      'SELECT username, display_name FROM users WHERE id = ?',
      [req.session.userId]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const user = rows[0];
    res.json({ username: user.username, displayName: user.display_name });
  } catch (err) {
    console.error('Auth check error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
