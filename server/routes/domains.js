// server/routes/domains.js — Domain availability check via GoDaddy API
// POST /check — accepts { domains: [...] }, returns { results: [...] }

const express = require('express');
const axios = require('axios');

const router = express.Router();

const GODADDY_BASE = 'https://api.godaddy.com';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// POST /check
router.post('/check', async (req, res) => {
  const apiKey = process.env.DOMAIN_API_KEY;
  const apiSecret = process.env.DOMAIN_API_SECRET;

  // 503 if credentials missing
  if (!apiKey || !apiSecret) {
    return res.status(503).json({
      error: 'Domain API not configured. Set DOMAIN_API_KEY and DOMAIN_API_SECRET.'
    });
  }

  // 400 if domains missing or empty
  const { domains } = req.body || {};
  if (!Array.isArray(domains) || domains.length === 0) {
    return res.status(400).json({ error: 'At least one domain required' });
  }

  const results = [];

  for (let i = 0; i < domains.length; i++) {
    const domain = domains[i];

    try {
      const { data } = await axios.get(`${GODADDY_BASE}/v1/domains/available`, {
        params: { domain },
        headers: {
          Authorization: `sso-key ${apiKey}:${apiSecret}`
        }
      });

      results.push({
        domain: data.domain || domain,
        available: data.available,
        price: typeof data.price === 'number' ? data.price / 1_000_000 : null,
        currency: data.currency || null
      });
    } catch (err) {
      results.push({
        domain,
        available: null,
        price: null,
        currency: null,
        error: err.response?.data?.message || err.message || 'Unknown error'
      });
    }

    // Rate-limit: 300ms delay between requests
    if (i < domains.length - 1) {
      await sleep(300);
    }
  }

  res.json({ results });
});

module.exports = router;
