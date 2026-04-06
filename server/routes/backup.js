// server/routes/backup.js — Backup export/import endpoints
// GET /export — JSON file download of all leads
// POST /import — merge JSON array of leads with deduplication

const express = require('express');
const pool = require('../db');

const router = express.Router();

// --- camelCase → snake_case mapping (same as leads.js) ---

const FIELD_MAP = {
  reviewCount: 'review_count',
  topReviews: 'top_reviews',
  reviewSnippet: 'review_snippet',
  googleMapsUrl: 'google_maps_url',
  photoRefs: 'photo_refs',
  emailFound: 'email_found',
  screenshotFiles: 'screenshot_files',
  demoUrl: 'demo_url',
  visionAnalysis: 'vision_analysis',
  customPhotos: 'custom_photos',
  createdAt: 'created_at'
};

const JSON_COLUMNS = new Set([
  'top_reviews', 'photo_refs', 'screenshot_files', 'social', 'custom_photos'
]);

const ALL_COLUMNS = [
  'id', 'name', 'category', 'address', 'neighborhood', 'phone', 'website',
  'rating', 'review_count', 'top_reviews', 'review_snippet', 'google_maps_url',
  'photo_refs', 'stage', 'email', 'email_found', 'screenshot_files', 'demo_url',
  'notes', 'slug', 'social', 'score', 'vision_analysis', 'custom_photos', 'created_at'
];

function toSnakeCase(obj) {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = FIELD_MAP[key] || key;
    if (JSON_COLUMNS.has(snakeKey) && value != null && typeof value !== 'string') {
      result[snakeKey] = JSON.stringify(value);
    } else {
      result[snakeKey] = value;
    }
  }
  return result;
}

// GET /api/backup/export — return all leads as JSON file download
router.get('/export', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM leads ORDER BY created_at DESC');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="leads-backup.json"');
    res.send(JSON.stringify(rows, null, 2));
  } catch (err) {
    console.error('GET /api/backup/export error:', err.message);
    res.status(500).json({ error: 'Failed to export leads' });
  }
});

// POST /api/backup/import — accept JSON array of leads, merge with deduplication
router.post('/import', async (req, res) => {
  try {
    const leads = req.body;
    if (!Array.isArray(leads)) {
      return res.status(400).json({ error: 'Request body must be an array of leads' });
    }
    if (leads.length === 0) {
      return res.json({ imported: 0, skipped: 0 });
    }

    let imported = 0;
    let skipped = 0;

    for (const lead of leads) {
      const data = toSnakeCase(lead);
      if (!data.id) continue;

      const columns = ALL_COLUMNS.filter(c => c !== 'created_at' && data[c] !== undefined);
      const values = columns.map(c => data[c] ?? null);
      const placeholders = columns.map(() => '?').join(', ');

      const sql = `INSERT IGNORE INTO leads (${columns.join(', ')}) VALUES (${placeholders})`;
      const [result] = await pool.execute(sql, values);

      if (result.affectedRows > 0) {
        imported++;
      } else {
        skipped++;
      }
    }

    res.json({ imported, skipped });
  } catch (err) {
    console.error('POST /api/backup/import error:', err.message);
    res.status(500).json({ error: 'Failed to import leads' });
  }
});

module.exports = router;
