// server/routes/assets.js — Asset CRUD endpoints
// GET / — list all assets
// POST / — create asset
// PATCH /:id — update asset
// DELETE /:id — delete asset

const express = require('express');
const pool = require('../db');

const router = express.Router();

const ALL_COLUMNS = [
  'id', 'type', 'name', 'content', 'filename', 'instructions', 'url', 'notes', 'created_at'
];

// GET /api/assets — return all assets as JSON array
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM assets ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    console.error('GET /api/assets error:', err.message);
    res.status(500).json({ error: 'Failed to fetch assets' });
  }
});

// POST /api/assets — create a new asset
router.post('/', async (req, res) => {
  try {
    const data = req.body;
    if (!data.id) {
      data.id = `asset_${Date.now()}`;
    }

    const columns = ALL_COLUMNS.filter(c => c !== 'created_at' && data[c] !== undefined);
    const values = columns.map(c => data[c] ?? null);
    const placeholders = columns.map(() => '?').join(', ');

    await pool.execute(
      `INSERT INTO assets (${columns.join(', ')}) VALUES (${placeholders})`,
      values
    );

    const [rows] = await pool.execute('SELECT * FROM assets WHERE id = ?', [data.id]);
    res.json(rows[0]);
  } catch (err) {
    console.error('POST /api/assets error:', err.message);
    res.status(500).json({ error: 'Failed to create asset' });
  }
});

// PATCH /api/assets/:id — partial update
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [existing] = await pool.execute('SELECT id FROM assets WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    const data = req.body;
    const columns = Object.keys(data).filter(
      c => ALL_COLUMNS.includes(c) && c !== 'id' && c !== 'created_at'
    );

    if (columns.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const setClause = columns.map(c => `${c} = ?`).join(', ');
    const values = columns.map(c => data[c] ?? null);
    values.push(id);

    await pool.execute(`UPDATE assets SET ${setClause} WHERE id = ?`, values);

    const [rows] = await pool.execute('SELECT * FROM assets WHERE id = ?', [id]);
    res.json(rows[0]);
  } catch (err) {
    console.error('PATCH /api/assets/:id error:', err.message);
    res.status(500).json({ error: 'Failed to update asset' });
  }
});

// DELETE /api/assets/:id — remove asset
router.delete('/:id', async (req, res) => {
  try {
    const [result] = await pool.execute('DELETE FROM assets WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Asset not found' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/assets/:id error:', err.message);
    res.status(500).json({ error: 'Failed to delete asset' });
  }
});

module.exports = router;
