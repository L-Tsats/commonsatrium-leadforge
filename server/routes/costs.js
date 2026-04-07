// server/routes/costs.js — Cost tracking, search state, and search log routes

const express = require('express');
const router = express.Router();
const { getCosts, resetCosts, loadSearchState, clearSearchState, loadSearchLog, unblockUser } = require('../lib/costTracker');

// Get current costs (includes per-user breakdown and blocked list)
router.get('/costs', (req, res) => {
  const costs = getCosts();
  costs.budget = parseFloat(process.env.GOOGLE_API_BUDGET) || 999;
  res.json(costs);
});

// Update budget
router.post('/costs/budget', (req, res) => {
  const { budget } = req.body;
  if (budget == null || budget < 0) return res.status(400).json({ error: 'Invalid budget' });
  // Update the env var in memory (persists until restart)
  process.env.GOOGLE_API_BUDGET = String(budget);
  res.json({ ok: true, budget });
});

// Reset costs (monthly or manual) — also unblocks everyone
router.post('/costs/reset', (req, res) => {
  res.json(resetCosts());
});

// Unblock a specific user
router.post('/costs/unblock', (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'username required' });
  unblockUser(username);
  res.json({ ok: true });
});

// Get search state (for resuming)
router.get('/search-state', (req, res) => {
  const state = loadSearchState();
  res.json({ state });
});

// Clear search state
router.post('/search-state/clear', (req, res) => {
  clearSearchState();
  res.json({ ok: true });
});

// Get search log
router.get('/search-log', (req, res) => {
  res.json({ log: loadSearchLog() });
});

module.exports = router;
