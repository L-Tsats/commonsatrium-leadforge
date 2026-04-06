// server/routes/templates.js — Email template endpoints
// GET / — return all templates keyed by slug
// PUT / — upsert templates (accepts object keyed by slug)

const express = require('express');
const pool = require('../db');

const router = express.Router();

// GET /api/templates — return all templates as { slug: { name, subject, body }, ... }
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT slug, name, subject, body FROM templates');
    const result = {};
    for (const row of rows) {
      result[row.slug] = { name: row.name, subject: row.subject, body: row.body };
    }
    res.json(result);
  } catch (err) {
    console.error('GET /api/templates error:', err.message);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// PUT /api/templates — save/update templates (accepts { slug: { name, subject, body }, ... })
router.put('/', async (req, res) => {
  try {
    const templates = req.body;
    if (!templates || typeof templates !== 'object' || Array.isArray(templates)) {
      return res.status(400).json({ error: 'Request body must be an object keyed by slug' });
    }

    for (const [slug, tpl] of Object.entries(templates)) {
      const name = tpl.name || slug;
      const subject = tpl.subject || '';
      const body = tpl.body || '';

      await pool.execute(
        `INSERT INTO templates (slug, name, subject, body)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), subject = VALUES(subject), body = VALUES(body)`,
        [slug, name, subject, body]
      );
    }

    // Return the updated templates in the same keyed format
    const [rows] = await pool.query('SELECT slug, name, subject, body FROM templates');
    const result = {};
    for (const row of rows) {
      result[row.slug] = { name: row.name, subject: row.subject, body: row.body };
    }
    res.json(result);
  } catch (err) {
    console.error('PUT /api/templates error:', err.message);
    res.status(500).json({ error: 'Failed to save templates' });
  }
});

module.exports = router;
