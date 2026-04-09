// server/lib/costTracker.js — Tracks Google Places API costs in real-time
// Supports per-user tracking and blocking

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const COST_FILE = path.join(DATA_DIR, 'api-costs.json');
const LOG_FILE = path.join(DATA_DIR, 'search-log.json');
const STATE_FILE = path.join(DATA_DIR, 'search-state.json');

// Google Places API costs (USD)
const COSTS = {
  textSearch: 0.032,
  placeDetails: 0.017,
  placePhoto: 0.007,
  cseSearch: 0.005,  // Google Custom Search: free first 100/day, then $5/1000
};

const CSE_FREE_DAILY = 100;

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ── Cost Tracking ──

function getDefaultData() {
  return {
    total: 0,
    breakdown: { textSearch: 0, placeDetails: 0, placePhoto: 0, cseSearch: 0 },
    calls: { textSearch: 0, placeDetails: 0, placePhoto: 0, cseSearch: 0 },
    cseDailyCount: 0,
    cseDailyDate: new Date().toISOString().slice(0, 10),
    resetDate: new Date().toISOString().slice(0, 7),
    users: {},
    blockedUsers: [],
  };
}

function loadCosts() {
  try {
    const data = JSON.parse(fs.readFileSync(COST_FILE, 'utf-8'));
    if (!data.users) data.users = {};
    if (!data.blockedUsers) data.blockedUsers = [];
    return data;
  } catch { return getDefaultData(); }
}

function saveCosts(data) {
  ensureDir();
  fs.writeFileSync(COST_FILE, JSON.stringify(data, null, 2));
}

function autoReset(data) {
  const currentMonth = new Date().toISOString().slice(0, 7);
  if (data.resetDate !== currentMonth) {
    const fresh = getDefaultData();
    fresh.resetDate = currentMonth;
    return fresh;
  }
  return data;
}

function addCost(type, username) {
  let data = autoReset(loadCosts());

  // CSE daily free tier reset
  const today = new Date().toISOString().slice(0, 10);
  if (data.cseDailyDate !== today) {
    data.cseDailyCount = 0;
    data.cseDailyDate = today;
  }

  let cost = COSTS[type] || 0;

  // CSE: first 100 queries per day are free
  if (type === 'cseSearch') {
    data.cseDailyCount = (data.cseDailyCount || 0) + 1;
    if (data.cseDailyCount <= CSE_FREE_DAILY) {
      cost = 0; // free tier
    }
  }

  data.total += cost;
  data.breakdown[type] = (data.breakdown[type] || 0) + cost;
  data.calls[type] = (data.calls[type] || 0) + 1;
  // Per-user tracking
  if (username) {
    if (!data.users[username]) data.users[username] = { total: 0, calls: 0 };
    data.users[username].total += cost;
    data.users[username].calls += 1;
  }
  saveCosts(data);
  return data;
}

function canAfford(type, budget) {
  const data = autoReset(loadCosts());
  const cost = COSTS[type] || 0;
  return (data.total + cost) <= budget;
}

function isUserBlocked(username) {
  const data = autoReset(loadCosts());
  return data.blockedUsers.includes(username);
}

function blockUser(username, reason) {
  const data = autoReset(loadCosts());
  if (!data.blockedUsers.includes(username)) {
    data.blockedUsers.push(username);
  }
  const apiKey = process.env.GOOGLE_SERVICES_API_KEY || 'unknown';
  addSearchLog({ action: 'USER_BLOCKED', username, reason, totalAtBlock: data.total, apiKey });
  saveCosts(data);
}

function unblockUser(username) {
  const data = loadCosts();
  data.blockedUsers = data.blockedUsers.filter(u => u !== username);
  saveCosts(data);
}

function getCosts() {
  return autoReset(loadCosts());
}

function getBudget() {
  const data = loadCosts();
  return data.budget || parseFloat(process.env.GOOGLE_API_BUDGET) || 280;
}

function resetCosts() {
  const data = getDefaultData();
  saveCosts(data);
  return data;
}

// ── Search State (resumable) ──

function loadSearchState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')); }
  catch { return null; }
}

function saveSearchState(state) {
  ensureDir();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function clearSearchState() {
  try { fs.unlinkSync(STATE_FILE); } catch {}
}

// ── Search Log ──

function loadSearchLog() {
  try { return JSON.parse(fs.readFileSync(LOG_FILE, 'utf-8')); }
  catch { return []; }
}

function addSearchLog(entry) {
  ensureDir();
  const log = loadSearchLog();
  log.push({ ...entry, timestamp: new Date().toISOString() });
  if (log.length > 500) log.splice(0, log.length - 500);
  fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));
}

module.exports = {
  COSTS,
  addCost,
  canAfford,
  isUserBlocked,
  blockUser,
  unblockUser,
  getCosts,
  getBudget,
  resetCosts,
  loadSearchState,
  saveSearchState,
  clearSearchState,
  loadSearchLog,
  addSearchLog,
};
