#!/usr/bin/env node

// scripts/migrate-data.js — Migrate leads from data/leads-backup.json into MySQL
// Usage: node scripts/migrate-data.js

const path = require('path');
const fs = require('fs');

// Load .env from project root
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const pool = require('../server/db');

// --- camelCase → snake_case mapping (same as server/routes/leads.js) ---

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
  'notes', 'slug', 'social', 'score', 'vision_analysis', 'custom_photos'
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

async function migrate() {
  const backupPath = path.resolve(__dirname, '..', 'data', 'leads-backup.json');

  if (!fs.existsSync(backupPath)) {
    console.log('Backup file not found:', backupPath);
    console.log('Nothing to migrate.');
    process.exit(0);
  }

  const raw = fs.readFileSync(backupPath, 'utf-8');
  const leads = JSON.parse(raw);

  if (!Array.isArray(leads) || leads.length === 0) {
    console.log('No leads found in backup file.');
    process.exit(0);
  }

  console.log(`Found ${leads.length} leads in backup file.`);

  let imported = 0;
  let skipped = 0;

  for (const lead of leads) {
    const data = toSnakeCase(lead);
    if (!data.id) {
      skipped++;
      continue;
    }

    const columns = ALL_COLUMNS.filter(c => data[c] !== undefined);
    const values = columns.map(c => data[c] ?? null);
    const placeholders = columns.map(() => '?').join(', ');

    const sql = `INSERT IGNORE INTO leads (${columns.join(', ')}) VALUES (${placeholders})`;

    try {
      const [result] = await pool.execute(sql, values);
      if (result.affectedRows > 0) {
        imported++;
      } else {
        skipped++;
      }
    } catch (err) {
      console.error(`Error inserting lead "${data.name || data.id}":`, err.message);
      skipped++;
    }
  }

  console.log(`Migration complete: ${imported} imported, ${skipped} skipped.`);
  await pool.end();
  process.exit(0);
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
