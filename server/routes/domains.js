// server/routes/domains.js — Domain availability check via GoDaddy API + manual registrar links
// POST /check — queries GoDaddy for availability/price, includes links to check on other registrars
// POST /suggest — AI-powered domain suggestions via Claude

const express = require('express');
const axios = require('axios');

const router = express.Router();

const GODADDY_BASE = 'https://api.godaddy.com';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── GoDaddy check ───────────────────────────────────────────────────────────
async function checkGoDaddy(domain) {
  const apiKey = process.env.DOMAIN_API_KEY;
  const apiSecret = process.env.DOMAIN_API_SECRET;
  if (!apiKey || !apiSecret) return null;

  try {
    const { data } = await axios.get(`${GODADDY_BASE}/v1/domains/available`, {
      params: { domain },
      headers: { Authorization: `sso-key ${apiKey}:${apiSecret}` }
    });
    return {
      registrar: 'GoDaddy',
      available: data.available,
      price: typeof data.price === 'number' ? data.price / 1_000_000 : null,
      currency: data.currency || 'USD',
      link: `https://www.godaddy.com/domainsearch/find?domainToCheck=${domain}`
    };
  } catch (err) {
    return { registrar: 'GoDaddy', available: null, price: null, currency: null, error: err.response?.data?.message || err.message };
  }
}

// ─── Manual check links — pre-filled search URLs for registrars without APIs ─
function getManualLinks(domain) {
  const name = domain.split('.')[0];
  return [
    { registrar: 'Papaki', link: `https://www.papaki.com/en/domain-search.htm?domain=${domain}` },
    { registrar: 'Tophost', link: `https://www.tophost.gr/domain-names?search=${domain}` },
    { registrar: 'Namecheap', link: `https://www.namecheap.com/domains/registration/results/?domain=${domain}` },
    { registrar: 'Cloudflare', link: `https://www.cloudflare.com/products/registrar/` },
    { registrar: 'Gandi', link: `https://shop.gandi.net/en/domain/suggest?search=${name}` },
  ];
}

// POST /check
router.post('/check', async (req, res) => {
  const hasGoDaddy = process.env.DOMAIN_API_KEY && process.env.DOMAIN_API_SECRET;

  if (!hasGoDaddy) {
    return res.status(503).json({
      error: 'Domain API not configured. Set DOMAIN_API_KEY and DOMAIN_API_SECRET (GoDaddy).'
    });
  }

  const { domains } = req.body || {};
  if (!Array.isArray(domains) || domains.length === 0) {
    return res.status(400).json({ error: 'At least one domain required' });
  }

  const results = [];

  for (let i = 0; i < domains.length; i++) {
    const domain = domains[i];
    const godaddyResult = await checkGoDaddy(domain);

    results.push({
      domain,
      available: godaddyResult?.available ?? null,
      bestPrice: godaddyResult?.price ?? null,
      bestRegistrar: godaddyResult?.available ? 'GoDaddy' : null,
      currency: godaddyResult?.currency ?? null,
      registrars: godaddyResult ? [godaddyResult] : [],
      manualLinks: getManualLinks(domain),
      error: godaddyResult?.error || null
    });

    // Rate-limit between domains
    if (i < domains.length - 1) {
      await sleep(400);
    }
  }

  res.json({ results });
});

// POST /suggest — AI-powered domain suggestions via Claude
router.post('/suggest', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'Anthropic API key not configured.' });
  }

  const { name, category, neighborhood } = req.body || {};
  if (!name) {
    return res.status(400).json({ error: 'Business name required' });
  }

  const prompt = `You are a domain name consultant. A client needs domain name suggestions for a Greek business.

Business name: "${name}"
Category: ${category || 'unknown'}
Location: ${neighborhood || 'Greece'}

Generate 8-12 creative, brandable domain name suggestions. Include a mix of:
- Direct name variations (.gr and .com)
- Shortened/abbreviated versions
- Creative combinations of the name + business type
- Catchy, memorable alternatives that still relate to the business

Rules:
- All domains must be lowercase, alphanumeric with optional hyphens
- Prioritize .gr domains (this is a Greek business) but include some .com
- Strip any location/neighborhood from the name — domains should be location-independent
- Keep them short and easy to type (under 20 characters before the TLD)
- No numbers unless they're part of the business name
- If the name is in Greek characters, transliterate to Latin

Return ONLY a JSON array of domain strings, no explanation. Example:
["manoleas.gr", "manoleasbarber.gr", "manoleas.com", "themanoleas.gr"]`;

  try {
    const response = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }]
    }, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      }
    });

    const text = (response.data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) {
      return res.status(500).json({ error: 'Failed to parse AI suggestions' });
    }

    const suggestions = JSON.parse(match[0]).filter(d => typeof d === 'string' && d.includes('.'));
    res.json({ suggestions });
  } catch (err) {
    console.error('Domain suggest error:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data?.error?.message || err.message });
  }
});

module.exports = router;
