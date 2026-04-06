// server/routes/leads.js — Lead CRUD endpoints
// GET /, GET /:id, POST /, POST /bulk, PATCH /:id, DELETE /:id

const express = require('express');
const pool = require('../db');

const router = express.Router();

// --- camelCase ↔ snake_case mapping ---

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
  domainResults: 'domain_results',
  domainCheckedAt: 'domain_checked_at',
  domainWatchlist: 'domain_watchlist',
  createdAt: 'created_at'
};

const REVERSE_FIELD_MAP = Object.fromEntries(
  Object.entries(FIELD_MAP).map(([camel, snake]) => [snake, camel])
);

const JSON_COLUMNS = new Set([
  'top_reviews', 'photo_refs', 'screenshot_files', 'social', 'custom_photos', 'domain_results', 'domain_watchlist'
]);

const ALL_COLUMNS = [
  'id', 'name', 'category', 'address', 'neighborhood', 'phone', 'website',
  'rating', 'review_count', 'top_reviews', 'review_snippet', 'google_maps_url',
  'photo_refs', 'stage', 'email', 'email_found', 'screenshot_files', 'demo_url',
  'notes', 'slug', 'social', 'score', 'vision_analysis', 'custom_photos',
  'domain_results', 'domain_checked_at', 'domain_watchlist', 'created_at'
];

/**
 * Convert a camelCase frontend object to snake_case DB columns.
 * JSON columns are stringified.
 */
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

/**
 * Convert a snake_case DB row to camelCase frontend object.
 * JSON columns are parsed.
 */
function toCamelCase(row) {
  const result = {};
  for (const [key, value] of Object.entries(row)) {
    const camelKey = REVERSE_FIELD_MAP[key] || key;
    if (JSON_COLUMNS.has(key) && typeof value === 'string') {
      try { result[camelKey] = JSON.parse(value); } catch { result[camelKey] = value; }
    } else {
      result[camelKey] = value;
    }
  }
  return result;
}


// GET /api/leads — return all leads as JSON array
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM leads ORDER BY created_at DESC');
    res.json(rows.map(toCamelCase));
  } catch (err) {
    console.error('GET /api/leads error:', err.message);
    res.status(500).json({ error: 'Failed to fetch leads' });
  }
});

// GET /api/leads/stats — return aggregate lead statistics
router.get('/stats', async (req, res) => {
  try {
    const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM leads');
    const [stageCounts] = await pool.query(
      'SELECT stage, COUNT(*) AS count FROM leads GROUP BY stage'
    );
    const [[{ withEmail }]] = await pool.query(
      'SELECT COUNT(*) AS withEmail FROM leads WHERE email IS NOT NULL'
    );
    const [[{ withPhone }]] = await pool.query(
      'SELECT COUNT(*) AS withPhone FROM leads WHERE phone IS NOT NULL'
    );
    const [[{ avgRating }]] = await pool.query(
      'SELECT AVG(rating) AS avgRating FROM leads'
    );

    const stages = {};
    for (const row of stageCounts) {
      stages[row.stage || 'unknown'] = row.count;
    }

    res.json({
      total,
      stages,
      withEmail,
      withPhone,
      avgRating: avgRating != null ? parseFloat(Number(avgRating).toFixed(2)) : null
    });
  } catch (err) {
    console.error('GET /api/leads/stats error:', err.message);
    res.status(500).json({ error: 'Failed to fetch lead stats' });
  }
});

// GET /api/leads/export/csv — return CSV file download of all leads
router.get('/export/csv', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM leads ORDER BY created_at DESC');

    const csvHeaders = [
      'name', 'category', 'address', 'neighborhood', 'phone',
      'email', 'website', 'rating', 'review_count', 'stage', 'demo_url'
    ];

    const escapeCsv = (val) => {
      if (val == null) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };

    let csv = csvHeaders.join(',') + '\n';
    for (const row of rows) {
      csv += csvHeaders.map(h => escapeCsv(row[h])).join(',') + '\n';
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="leads-export.csv"');
    res.send(csv);
  } catch (err) {
    console.error('GET /api/leads/export/csv error:', err.message);
    res.status(500).json({ error: 'Failed to export leads as CSV' });
  }
});

// GET /api/leads/:id — return single lead by id (404 if not found)
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM leads WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    res.json(toCamelCase(rows[0]));
  } catch (err) {
    console.error('GET /api/leads/:id error:', err.message);
    res.status(500).json({ error: 'Failed to fetch lead' });
  }
});

// POST /api/leads — upsert a lead (INSERT ... ON DUPLICATE KEY UPDATE)
router.post('/', async (req, res) => {
  try {
    const data = toSnakeCase(req.body);
    if (!data.id) {
      return res.status(400).json({ error: 'Lead id is required' });
    }

    const columns = ALL_COLUMNS.filter(c => c !== 'created_at' && data[c] !== undefined);
    const values = columns.map(c => data[c] ?? null);
    const placeholders = columns.map(() => '?').join(', ');
    const updateClause = columns
      .filter(c => c !== 'id')
      .map(c => `${c} = VALUES(${c})`)
      .join(', ');

    const sql = `INSERT INTO leads (${columns.join(', ')}) VALUES (${placeholders})
      ON DUPLICATE KEY UPDATE ${updateClause}`;

    await pool.execute(sql, values);

    const [rows] = await pool.execute('SELECT * FROM leads WHERE id = ?', [data.id]);
    res.json(toCamelCase(rows[0]));
  } catch (err) {
    console.error('POST /api/leads error:', err.message);
    res.status(500).json({ error: 'Failed to upsert lead' });
  }
});

// POST /api/leads/bulk — merge array of leads without overwriting existing (INSERT IGNORE)
router.post('/bulk', async (req, res) => {
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
    console.error('POST /api/leads/bulk error:', err.message);
    res.status(500).json({ error: 'Failed to bulk import leads' });
  }
});

// PATCH /api/leads/:id — partial update
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check lead exists
    const [existing] = await pool.execute('SELECT id FROM leads WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const data = toSnakeCase(req.body);
    // Only update columns that are present in the request body
    const columns = Object.keys(data).filter(
      c => ALL_COLUMNS.includes(c) && c !== 'id' && c !== 'created_at'
    );

    if (columns.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const setClause = columns.map(c => `${c} = ?`).join(', ');
    const values = columns.map(c => data[c] ?? null);
    values.push(id);

    await pool.execute(`UPDATE leads SET ${setClause} WHERE id = ?`, values);

    const [rows] = await pool.execute('SELECT * FROM leads WHERE id = ?', [id]);
    res.json(toCamelCase(rows[0]));
  } catch (err) {
    console.error('PATCH /api/leads/:id error:', err.message);
    res.status(500).json({ error: 'Failed to update lead' });
  }
});

// DELETE /api/leads/:id — remove lead
router.delete('/:id', async (req, res) => {
  try {
    const [result] = await pool.execute('DELETE FROM leads WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/leads/:id error:', err.message);
    res.status(500).json({ error: 'Failed to delete lead' });
  }
});

module.exports = router;
