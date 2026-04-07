// server/routes/proxy.js — Migrated proxy routes from proxy/index.js
// Mounted at /api in app.js — handles places, hunter, screenshots, video,
// photo analysis, lead folders, common assets, social enrichment, config

const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const router = express.Router();

const { addCost, canAfford, isUserBlocked, blockUser, getBudget, addSearchLog, saveSearchState, loadSearchState, clearSearchState } = require('../lib/costTracker');

// ─── Directory paths ─────────────────────────────────────────────────────────

const SHOTS_DIR = path.join(__dirname, '..', '..', 'screenshots');
const SITES_DIR = path.join(__dirname, '..', '..', 'sites');
const COMMON_DIR = path.join(__dirname, '..', '..', 'common-assets');
const MANIFEST_PATH = path.join(COMMON_DIR, 'manifest.json');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function guessDomains(name) {
  const clean = name.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, '');
  const words = name.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().split(/\s+/);
  return [...new Set([
    `${clean}.gr`, `${clean}.com`,
    `${words.slice(0, 2).join('')}.gr`, `${words.slice(0, 2).join('')}.com`,
    `${words[0]}.gr`, `${words[0]}.com`
  ])];
}

function categorySpecificPrompt(cat = '') {
  const c = (cat || '').toLowerCase();
  if (c.includes('restaurant') || c.includes('cafe') || c.includes('bakery') || c.includes('patisserie'))
    return `- What does the food presentation style look like? (rustic plating, fine dining, casual, street food)
- Describe the dining area layout (open, intimate, bar seating, outdoor terrace)
- Menu board style if visible (chalkboard, printed, digital, handwritten)
- Suggest how to present a menu section on the website (cards, grid, list with photos)`;
  if (c.includes('hair') || c.includes('beauty') || c.includes('spa') || c.includes('nail') || c.includes('barber'))
    return `- Describe the salon/studio interior style (modern, vintage, luxe, industrial)
- What's the mirror/station setup like?
- Suggest how to present services & pricing on the website
- Suggest a gallery layout style that matches the vibe (masonry, carousel, before/after)`;
  if (c.includes('gym') || c.includes('fitness') || c.includes('physio') || c.includes('yoga') || c.includes('pilates'))
    return `- Describe the equipment/space style (high-tech, raw/industrial, boutique, zen)
- What's the energy level? (intense, calm, motivational, clinical)
- Suggest how to present class schedules or services
- Suggest imagery style for the hero section`;
  if (c.includes('dental') || c.includes('medical') || c.includes('clinic'))
    return `- Describe the clinical environment (sterile/modern, warm/welcoming, high-tech)
- Is there a waiting area visible? Describe its feel
- Suggest how to present the team/doctors section
- Suggest how to handle the booking/appointment CTA`;
  if (c.includes('hotel') || c.includes('guest') || c.includes('boutique'))
    return `- Describe the room/lobby style (luxury, boutique, minimalist, traditional)
- What amenities are visible?
- Suggest how to present rooms/suites on the website
- Suggest a booking section layout`;
  if (c.includes('law') || c.includes('account') || c.includes('notary'))
    return `- Describe the office environment (traditional, modern, prestigious)
- Suggest how to present practice areas/services
- Suggest a professional team section layout`;
  return `- What are the key visual selling points of this space?
- Suggest the most important sections for this type of business website
- What should the hero section communicate immediately?`;
}

function loadManifest() {
  try { return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8')); } catch { return {}; }
}
function saveManifest(m) { fs.writeFileSync(MANIFEST_PATH, JSON.stringify(m, null, 2)); }

// ─── Static file serving ─────────────────────────────────────────────────────

// Serve screenshots statically
router.use('/screenshots', express.static(SHOTS_DIR));

// Serve lead images from sites/ directory
router.use('/lead-images', express.static(SITES_DIR));

// Serve common assets files
router.use('/common-assets-files', express.static(COMMON_DIR));

// ─── Google Places ───────────────────────────────────────────────────────────

router.post('/places/search', async (req, res) => {
  const { query, pagetoken } = req.body;
  const username = req.session?.user?.username || 'unknown';
  const budget = getBudget();
  if (isUserBlocked(username)) {
    return res.status(403).json({ error: 'Your search access has been suspended for this month due to budget overuse.', code: 'USER_BLOCKED' });
  }
  if (!canAfford('textSearch', budget)) {
    blockUser(username, 'Budget exceeded during text search');
    return res.status(402).json({ error: 'Budget limit reached. Your search access has been suspended.', code: 'BUDGET_EXCEEDED' });
  }
  try {
    const params = { query, key: process.env.GOOGLE_PLACES_API_KEY, language: 'en' };
    if (pagetoken) params.pagetoken = pagetoken;
    const { data } = await axios.get('https://maps.googleapis.com/maps/api/place/textsearch/json', { params });
    addCost('textSearch', username);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/places/details', async (req, res) => {
  const { place_id } = req.body;
  const username = req.session?.user?.username || 'unknown';
  const budget = getBudget();
  if (isUserBlocked(username)) {
    return res.status(403).json({ error: 'Search access suspended.', code: 'USER_BLOCKED' });
  }
  if (!canAfford('placeDetails', budget)) {
    blockUser(username, 'Budget exceeded during place details');
    return res.status(402).json({ error: 'Budget limit reached.', code: 'BUDGET_EXCEEDED' });
  }
  const fields = 'name,formatted_address,formatted_phone_number,international_phone_number,website,rating,user_ratings_total,reviews,types,url,opening_hours,business_status,photos';
  try {
    const { data } = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', {
      params: { place_id, fields, key: process.env.GOOGLE_PLACES_API_KEY, language: 'en' }
    });
    addCost('placeDetails', username);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/places/photo', async (req, res) => {
  const { ref, maxwidth } = req.query;
  const username = req.session?.user?.username || 'unknown';
  const budget = getBudget();
  if (!ref) return res.status(400).json({ error: 'Photo reference required' });
  if (isUserBlocked(username)) {
    return res.status(403).json({ error: 'Search access suspended.', code: 'USER_BLOCKED' });
  }
  if (!canAfford('placePhoto', budget)) {
    blockUser(username, 'Budget exceeded during photo download');
    return res.status(402).json({ error: 'Budget limit reached.', code: 'BUDGET_EXCEEDED' });
  }
  try {
    const { data } = await axios.get('https://maps.googleapis.com/maps/api/place/photo', {
      params: { photoreference: ref, maxwidth: maxwidth || 800, key: process.env.GOOGLE_PLACES_API_KEY },
      responseType: 'arraybuffer'
    });
    addCost('placePhoto', username);
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Vision Analysis — analyze business photos for brief generation ──────────

router.post('/analyze/photos', async (req, res) => {
  const { photoRefs, customPhotos, businessName, category, slug } = req.body;

  const images = [];

  // If we have a slug, read ALL photos from the lead's folder — that's the source of truth
  if (slug) {
    const photosDir = path.join(SITES_DIR, slug, 'photos');
    if (fs.existsSync(photosDir)) {
      const files = fs.readdirSync(photosDir).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f)).sort();
      for (const file of files) {
        try {
          const imgData = fs.readFileSync(path.join(photosDir, file));
          const ext = path.extname(file).toLowerCase();
          const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
          images.push({ type: 'image', source: { type: 'base64', media_type: mime, data: imgData.toString('base64') } });
        } catch {}
      }
    }
  } else {
    // Fallback: use photoRefs and customPhotos if no folder
    for (const ref of (photoRefs || [])) {
      try {
        const { data } = await axios.get('https://maps.googleapis.com/maps/api/place/photo', {
          params: { photoreference: ref, maxwidth: 800, key: process.env.GOOGLE_PLACES_API_KEY },
          responseType: 'arraybuffer'
        });
        images.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: Buffer.from(data).toString('base64') } });
      } catch {}
    }
    for (const dataUri of (customPhotos || [])) {
      const match = dataUri.match(/^data:(image\/\w+);base64,(.+)$/);
      if (match) {
        images.push({ type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } });
      }
    }
  }

  if (!images.length) return res.status(400).json({ error: 'No photos found' });

  const prompt = `You are a senior web designer analyzing photos of a real local business. Your analysis will be given directly to an AI coding assistant (Kiro) that will build a website for this business. Kiro CANNOT see images — it can only read text. So everything you describe must be detailed enough to reproduce in code.

Business: "${businessName}"
Category: ${category}

You are looking at ${images.length} photos from their Google Maps listing. Photos are numbered 1 through ${images.length} in the order provided.

═══ SECTION 1: VIBE & ATMOSPHERE ═══
Describe the overall feel in 2-3 sentences. Be specific: is it cozy/modern/rustic/upscale/casual/traditional/industrial/minimalist? What's the lighting like? What would a customer feel walking in?

═══ SECTION 2: EXACT COLOR PALETTE ═══
Extract the dominant colors you see across ALL photos — interior walls, furniture, signage, branding, exterior.
Return as a usable CSS/Tailwind palette:
- Primary: #hex — what it's from (e.g. "wall color", "logo background")
- Secondary: #hex — what it's from
- Accent: #hex — what it's from
- Background: #hex — light/dark base
- Text: #hex — suggested text color for contrast
Include 5-8 colors total. Be precise with hex codes.

═══ SECTION 3: LOGO & SIGNAGE ═══
If you can see a logo or signage:
- Describe it in enough detail that someone could recreate it as an SVG (shape, text, font style, colors, layout)
- What font style is the business name in? (serif, sans-serif, script, hand-drawn, bold, thin, etc.)
- If there's no visible logo, suggest a logo concept that matches the vibe

═══ SECTION 4: DESIGN ELEMENTS TO REPRODUCE ═══
List specific visual elements a web developer should recreate:
- Textures (wood grain, marble, exposed brick, etc.)
- Patterns (tiles, stripes, geometric, etc.)
- Decorative elements (plants, neon, artwork style, etc.)
- Furniture/material style (modern metal, rustic wood, leather, etc.)
Describe each as a CSS-reproducible concept (gradients, borders, background patterns, etc.)

═══ SECTION 5: BUSINESS-TYPE-SPECIFIC SECTIONS ═══
Based on this being a "${category}" business, suggest:
${categorySpecificPrompt(category)}

═══ SECTION 6: FONT PAIRING SUGGESTION ═══
Based on the vibe, suggest a specific Google Fonts pairing:
- Heading font: [name] — why it matches
- Body font: [name] — why it matches

═══ SECTION 7: PHOTO-BY-PHOTO ASSET MAP ═══
Go through EVERY photo (1 to ${images.length}) and for each one, provide:
- Photo [N]: [What it shows in one line]
  - SUBJECT: What's in the photo (e.g. "outdoor terrace with string lights at dusk", "close-up of a margherita pizza", "barber chair with vintage mirror")
  - QUALITY: Rate it 1-5 for website usability (sharp, well-lit, good composition = 5)
  - WEBSITE USE: Exactly where and how to use it on the website. Be specific:
    - "Hero background — add dark overlay at 40% opacity, white heading text on top"
    - "Menu page — feature as the main image for the pasta section"
    - "About section — shows the team/owner, crop to portrait ratio"
    - "Gallery grid — row 2, pairs well with photo 5"
    - "Skip — blurry / duplicate / not useful"
  - CSS TREATMENT: Any filters or effects to apply (e.g. "slight warm filter", "grayscale with color accent on hover", "blur for background texture")
  - ALT TEXT: Write a proper alt text for accessibility

═══ SECTION 8: RECOMMENDED HERO SETUP ═══
Pick the single best photo for the homepage hero and describe the exact layout:
- Which photo number and why
- Overlay: color + opacity (e.g. "linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.6))")
- Text placement: where the heading and CTA should sit
- Suggested headline text that uses the business name
- Mobile adaptation: how should it crop/reposition on small screens

═══ SECTION 9: GALLERY CURATION ═══
Select the best photos for a gallery section and specify:
- Which photo numbers to include (in display order)
- Layout: masonry / grid / carousel / before-after — and why
- How many columns on desktop vs mobile
- Any hover effects that match the vibe

═══ SECTION 10: PHOTOGRAPHY DIRECTION ═══
For any pages that need images NOT covered by the Google Maps photos:
- Describe the style, subjects, color treatment, and mood
- Provide specific Unsplash/Pexels search terms that would match this business's vibe
- Note which sections of the website need these supplementary images

Be extremely specific and visual. Every description should be detailed enough for a developer who has NEVER seen this place to build a website that looks like it belongs to this exact business.

═══ SECTION 11: EXTRACTABLE ASSETS (JSON) ═══
At the very end of your response, output a JSON block wrapped in <assets> tags containing reusable assets extracted from your analysis. This will be automatically parsed and saved to an asset library.

<assets>
{
  "palette": {
    "name": "[Business name] Palette",
    "content": "CSS variables extracted from the analysis, e.g.:\\n--primary: #hex;\\n--secondary: #hex;\\n--accent: #hex;\\n--background: #hex;\\n--text: #hex;\\n--surface: #hex;"
  },
  "fonts": {
    "name": "[Business name] Typography",
    "content": "Heading: [Font Name] (Google Fonts)\\nBody: [Font Name] (Google Fonts)\\n\\n@import url('https://fonts.googleapis.com/css2?family=...');"
  },
  "logo": {
    "name": "[Business name] Logo Concept",
    "content": "SVG-ready description or actual SVG code if simple enough. Include: shape, text, colors, font style, layout."
  },
  "hero": {
    "name": "[Business name] Hero Setup",
    "content": "Photo: [number]\\nOverlay: [CSS gradient]\\nHeadline: [suggested text]\\nCTA: [button text]\\nLayout: [description]"
  }
}
</assets>

The JSON must be valid. Only include assets where you have enough information. The "content" fields should be copy-pasteable code or detailed specs.`;

  try {
    const response = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 7000,
      messages: [{
        role: 'user',
        content: [...images, { type: 'text', text: prompt }]
      }]
    }, {
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      }
    });

    const text = (response.data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');

    // Extract structured assets from <assets> tags
    let extractedAssets = null;
    const assetsMatch = text.match(/<assets>\s*([\s\S]*?)\s*<\/assets>/);
    if (assetsMatch) {
      try {
        extractedAssets = JSON.parse(assetsMatch[1]);
      } catch (e) {
        console.error('Failed to parse extracted assets:', e.message);
      }
    }

    // Return analysis text (without the raw assets tag) + parsed assets
    const cleanText = text.replace(/<assets>[\s\S]*?<\/assets>/g, '').trim();
    res.json({ ok: true, analysis: cleanText, photoCount: images.length, assets: extractedAssets });
  } catch (e) {
    console.error('Vision analysis error:', e.response?.data || e.message);
    res.status(500).json({ error: e.response?.data?.error?.message || e.message });
  }
});

// ─── Hunter.io ───────────────────────────────────────────────────────────────

router.post('/hunter/domain', async (req, res) => {
  const { domain } = req.body;
  try {
    const { data } = await axios.get('https://api.hunter.io/v2/domain-search', {
      params: { domain, api_key: process.env.HUNTER_API_KEY, limit: 5, type: 'generic' }
    });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/hunter/find', async (req, res) => {
  const { businessName } = req.body;
  const guesses = guessDomains(businessName);
  for (const domain of guesses) {
    try {
      const { data } = await axios.get('https://api.hunter.io/v2/domain-search', {
        params: { domain, api_key: process.env.HUNTER_API_KEY, limit: 5, type: 'generic' }
      });
      const emails = data?.data?.emails || [];
      if (emails.length) {
        const best = emails.find(e =>
          ['info','contact','hello','mail','booking','reception'].some(p => e.value.startsWith(p + '@'))
        ) || emails[0];
        return res.json({ found: true, email: best.value, confidence: best.confidence, domain });
      }
    } catch {}
    await sleep(200);
  }
  res.json({ found: false });
});

router.get('/hunter/credits', async (req, res) => {
  try {
    const { data } = await axios.get('https://api.hunter.io/v2/account', {
      params: { api_key: process.env.HUNTER_API_KEY }
    });
    res.json(data?.data?.requests || {});
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Puppeteer screenshots ───────────────────────────────────────────────────

router.post('/screenshot', async (req, res) => {
  const { url, leadId } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });
  try {
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const results = [];
    const base = `${leadId}_${Date.now()}`;

    // Desktop hero
    const desk = await browser.newPage();
    await desk.setViewport({ width: 1440, height: 900 });
    await desk.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(1500);
    const d1 = `${base}_desktop.png`;
    await desk.screenshot({ path: path.join(SHOTS_DIR, d1), clip: { x: 0, y: 0, width: 1440, height: 900 } });
    results.push(d1);

    // Full page
    const d2 = `${base}_full.png`;
    await desk.screenshot({ path: path.join(SHOTS_DIR, d2), fullPage: true });
    results.push(d2);
    await desk.close();

    // Mobile
    const mob = await browser.newPage();
    await mob.setViewport({ width: 390, height: 844, isMobile: true });
    await mob.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(1000);
    const d3 = `${base}_mobile.png`;
    await mob.screenshot({ path: path.join(SHOTS_DIR, d3), clip: { x: 0, y: 0, width: 390, height: 844 } });
    results.push(d3);
    await mob.close();

    await browser.close();
    res.json({ ok: true, files: results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Puppeteer video capture — full site walkthrough ─────────────────────────

router.post('/video', async (req, res) => {
  const { url, leadId, slug } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });

  // Stream progress via SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  const send = (msg) => res.write(`data: ${JSON.stringify(msg)}\n\n`);

  const outputDir = slug ? path.join(SITES_DIR, slug) : SHOTS_DIR;
  fs.mkdirSync(outputDir, { recursive: true });

  try {
    const puppeteer = require('puppeteer');
    const { execSync } = require('child_process');
    send({ progress: 'Launching browser...' });
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const base = `${leadId || 'site'}_${Date.now()}`;
    const results = [];

    async function recordPage(page, viewport, label) {
      const framesDir = path.join(outputDir, `_frames_${label}`);
      fs.mkdirSync(framesDir, { recursive: true });

      let frameIndex = 0;
      const FPS = 30;
      const PX_PER_FRAME = 9;  // ~270px/sec at 30fps

      async function captureFrame() {
        const buf = await page.screenshot({ type: 'jpeg', quality: 85 });
        const framePath = path.join(framesDir, `frame_${String(frameIndex++).padStart(5, '0')}.jpg`);
        fs.writeFileSync(framePath, buf);
      }

      async function scrollAndCapture(page) {
        await page.evaluate(() => window.scrollTo(0, 0));
        let pos = 0;
        while (true) {
          const maxScroll = await page.evaluate(() => document.body.scrollHeight - window.innerHeight);
          if (pos >= maxScroll || maxScroll <= 0) break;
          pos = Math.min(pos + PX_PER_FRAME, maxScroll);
          await page.evaluate((y) => window.scrollTo(0, y), pos);
          await captureFrame();
        }
        // Hold at bottom for 1 second
        for (let i = 0; i < FPS; i++) await captureFrame();
      }

      // Homepage
      send({ progress: `📹 ${label}: Scrolling homepage...` });
      await page.evaluate(() => window.scrollTo(0, 0));
      await captureFrame(); // first frame at top
      await scrollAndCapture(page);

      // Find nav links
      const navLinks = await page.evaluate((baseUrl) => {
        const origin = new URL(baseUrl).origin;
        const links = Array.from(document.querySelectorAll('nav a[href], header a[href]'));
        const seen = new Set();
        const currentPath = new URL(baseUrl).pathname;
        return links.map(a => ({ href: a.href, text: a.textContent.trim() })).filter(({ href }) => {
          try {
            const u = new URL(href, baseUrl);
            if (u.origin !== origin) return false;
            if (u.pathname === currentPath || u.pathname === '/') return false;
            if (seen.has(u.pathname)) return false;
            seen.add(u.pathname);
            return true;
          } catch { return false; }
        });
      }, url);

      // Visit each page
      for (let i = 0; i < navLinks.length; i++) {
        const { href, text } = navLinks[i];
        send({ progress: `📹 ${label}: Visiting "${text || 'page ' + (i+1)}" (${i+1}/${navLinks.length})...` });
        try {
          await page.goto(href, { waitUntil: 'networkidle2', timeout: 15000 });
          // Brief pause at top of new page
          for (let p = 0; p < 5; p++) await captureFrame();
          await scrollAndCapture(page);
        } catch {}
      }

      // Stitch with ffmpeg
      send({ progress: `🎬 ${label}: Stitching ${frameIndex} frames into video...` });
      const outFile = `${base}_${label}.mp4`;
      const outPath = path.join(outputDir, outFile);
      try {
        execSync(`ffmpeg -y -framerate ${FPS} -i "${framesDir}/frame_%05d.jpg" -c:v libx264 -pix_fmt yuv420p -preset fast -crf 23 "${outPath}"`, { stdio: 'pipe' });
        results.push(outFile);
      } catch (e) {
        console.error('ffmpeg error:', e.message);
      }

      fs.rmSync(framesDir, { recursive: true, force: true });
      return navLinks.length;
    }

    // Desktop
    send({ progress: '🖥️ Starting desktop recording...' });
    const desk = await browser.newPage();
    await desk.setViewport({ width: 1440, height: 900 });
    await desk.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    const pageCount = await recordPage(desk, { width: 1440, height: 900 }, 'desktop');
    await desk.close();

    // Mobile
    send({ progress: '📱 Starting mobile recording...' });
    const mob = await browser.newPage();
    await mob.setViewport({ width: 390, height: 844, isMobile: true });
    await mob.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await recordPage(mob, { width: 390, height: 844 }, 'mobile');
    await mob.close();

    await browser.close();
    send({ done: true, files: results, pages: pageCount + 1 });
    res.end();
  } catch (e) {
    console.error('Video capture error:', e.message);
    send({ done: true, error: e.message, files: [], pages: 0 });
    res.end();
  }
});

// ─── Lead Folders — auto-created per lead in sites/ ─────────────────────────

// Greek transliteration for slugs
function toSlugServer(name) {
  const greek = {'α':'a','β':'b','γ':'g','δ':'d','ε':'e','ζ':'z','η':'i','θ':'th','ι':'i','κ':'k','λ':'l','μ':'m','ν':'n','ξ':'x','ο':'o','π':'p','ρ':'r','σ':'s','ς':'s','τ':'t','υ':'y','φ':'f','χ':'ch','ψ':'ps','ω':'o','ά':'a','έ':'e','ή':'i','ί':'i','ό':'o','ύ':'y','ώ':'o','ϊ':'i','ϋ':'y','ΐ':'i','ΰ':'y'};
  const transliterated = (name || 'site').toLowerCase().split('').map(c => greek[c] || c).join('');
  const slug = transliterated.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
  return slug || 'unnamed-lead';
}

// Migrate all lead folders — recompute slugs, create missing folders, move old content
router.post('/lead-folder/migrate', async (req, res) => {
  const { leads } = req.body; // array of { name, oldSlug }
  if (!leads?.length) return res.status(400).json({ error: 'No leads provided' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  const send = (msg) => res.write(`data: ${JSON.stringify(msg)}\n\n`);

  let created = 0, migrated = 0, skipped = 0;

  for (let i = 0; i < leads.length; i++) {
    const { name, oldSlug } = leads[i];
    const newSlug = toSlugServer(name);

    if (i % 50 === 0) send({ progress: `Processing ${i+1}/${leads.length}...` });

    const newDir = path.join(SITES_DIR, newSlug);
    const newPhotos = path.join(newDir, 'photos');
    const newAssets = path.join(newDir, 'assets');

    // Create new folder if it doesn't exist
    if (!fs.existsSync(newDir)) {
      fs.mkdirSync(newPhotos, { recursive: true });
      fs.mkdirSync(newAssets, { recursive: true });
      created++;
    }

    // If old slug is different and old folder exists, just delete it
    if (oldSlug && oldSlug !== newSlug) {
      const oldDir = path.join(SITES_DIR, oldSlug);
      if (fs.existsSync(oldDir)) {
        try { fs.rmSync(oldDir, { recursive: true, force: true }); } catch {}
        migrated++;
        send({ progress: `Cleaned up: ${oldSlug} → created fresh ${newSlug}` });
      }
    } else {
      skipped++;
    }
  }

  send({ done: true, created, migrated, skipped, total: leads.length });
  res.end();
});

// Create a lead folder with photos/ and assets/ subdirs
router.post('/lead-folder/create', (req, res) => {
  const { slug } = req.body;
  if (!slug) return res.status(400).json({ error: 'Slug required' });
  const dir = path.join(SITES_DIR, slug);
  fs.mkdirSync(path.join(dir, 'photos'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  res.json({ ok: true, path: `sites/${slug}` });
});

// Delete a lead folder
router.post('/lead-folder/delete', (req, res) => {
  const { slug } = req.body;
  if (!slug) return res.status(400).json({ error: 'Slug required' });
  const dir = path.join(SITES_DIR, slug);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  res.json({ ok: true });
});

// List images in a lead's photos/ or assets/ folder
router.get('/lead-folder/images', (req, res) => {
  const { slug, folder } = req.query;
  if (!slug || !folder) return res.status(400).json({ error: 'slug and folder required' });
  const dir = path.join(SITES_DIR, slug, folder);
  if (!fs.existsSync(dir)) return res.json({ files: [] });
  const files = fs.readdirSync(dir)
    .filter(f => /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(f))
    .sort();
  res.json({ files });
});

// Download Google Places photos into a lead's photos/ folder
router.post('/lead-folder/download-photos', async (req, res) => {
  const { slug, photoRefs } = req.body;
  const budget = getBudget();
  if (!slug || !photoRefs?.length) return res.status(400).json({ error: 'slug and photoRefs required' });
  const dir = path.join(SITES_DIR, slug, 'photos');
  fs.mkdirSync(dir, { recursive: true });
  const downloaded = [];
  for (let i = 0; i < photoRefs.length; i++) {
    if (!canAfford('placePhoto', budget)) {
      break;
    }
    try {
      const { data } = await axios.get('https://maps.googleapis.com/maps/api/place/photo', {
        params: { photoreference: photoRefs[i], maxwidth: 1200, key: process.env.GOOGLE_PLACES_API_KEY },
        responseType: 'arraybuffer'
      });
      addCost('placePhoto');
      const filename = `google-${String(i + 1).padStart(2, '0')}.jpg`;
      fs.writeFileSync(path.join(dir, filename), data);
      downloaded.push(filename);
    } catch {}
  }
  res.json({ ok: true, downloaded });
});

// Save the brief to the lead folder
router.post('/lead-folder/save-brief', (req, res) => {
  const { slug, brief } = req.body;
  if (!slug || !brief) return res.status(400).json({ error: 'slug and brief required' });
  const dir = path.join(SITES_DIR, slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'BRIEF.md'), brief, 'utf-8');
  res.json({ ok: true });
});

// ─── Common Assets — inbox sorting via Claude vision ─────────────────────────

// List inbox files
router.get('/common-assets/inbox', (req, res) => {
  const dir = path.join(COMMON_DIR, 'inbox');
  if (!fs.existsSync(dir)) return res.json({ files: [] });
  const files = fs.readdirSync(dir).filter(f => /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(f)).sort();
  res.json({ files });
});

// Get manifest
router.get('/common-assets/manifest', (req, res) => {
  res.json(loadManifest());
});

// Sort inbox — send all inbox images to Claude, categorize, move, update manifest
router.post('/common-assets/sort-inbox', async (req, res) => {
  const inboxDir = path.join(COMMON_DIR, 'inbox');
  if (!fs.existsSync(inboxDir)) return res.json({ sorted: 0 });

  const files = fs.readdirSync(inboxDir).filter(f => /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(f)).sort();
  if (!files.length) return res.json({ sorted: 0 });

  // Stream progress
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  const send = (msg) => res.write(`data: ${JSON.stringify(msg)}\n\n`);

  const manifest = loadManifest();
  let sorted = 0;

  // Process in batches of 3 to stay within rate limits
  for (let i = 0; i < files.length; i += 3) {
    const batch = files.slice(i, i + 3);
    send({ progress: `Analyzing images ${i+1}-${Math.min(i+3, files.length)} of ${files.length}...` });

    const images = [];
    const batchNames = [];
    for (const file of batch) {
      try {
        const data = fs.readFileSync(path.join(inboxDir, file));
        const ext = path.extname(file).toLowerCase();
        const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
        images.push({ type: 'image', source: { type: 'base64', media_type: mime, data: data.toString('base64') } });
        batchNames.push(file);
      } catch {}
    }

    if (!images.length) continue;

    const prompt = `You are sorting stock images into categories for a web design asset library.

For each image (${batchNames.map((f,j) => `Image ${j+1}: "${f}"`).join(', ')}), return a JSON array with one object per image:

[
  {
    "filename": "original filename",
    "category": "one of: textures, patterns, icons, backgrounds, placeholders",
    "newName": "descriptive-kebab-case-name.ext (e.g. warm-wood-grain-texture.jpg)",
    "description": "One sentence describing what this image shows and how to use it on a website",
    "tags": ["tag1", "tag2", "tag3"],
    "businessTypes": ["which business categories this works well for, e.g. restaurants, salons, clinics"]
  }
]

Categories:
- textures: surface textures (wood, marble, concrete, fabric, paper)
- patterns: repeating patterns, geometric designs, subtle backgrounds
- icons: icons, symbols, simple graphics
- backgrounds: hero images, gradient overlays, abstract shapes, scenic shots
- placeholders: generic people, team photos, product placeholders

Return ONLY valid JSON array, no markdown.`;

    try {
      let response;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          response = await axios.post('https://api.anthropic.com/v1/messages', {
            model: 'claude-sonnet-4-20250514',
            max_tokens: 2000,
            messages: [{ role: 'user', content: [...images, { type: 'text', text: prompt }] }]
          }, {
            headers: {
              'x-api-key': process.env.ANTHROPIC_API_KEY,
              'anthropic-version': '2023-06-01',
              'content-type': 'application/json'
            }
          });
          break;
        } catch (err) {
          const isRateLimit = err.response?.status === 429 || (err.response?.data?.error?.message || '').includes('rate limit');
          if (isRateLimit && attempt < 2) {
            const waitSec = 65;
            send({ progress: `⏳ Rate limited — waiting ${waitSec}s before retrying (attempt ${attempt+2}/3)...` });
            await sleep(waitSec * 1000);
          } else {
            throw err;
          }
        }
      }

      const text = (response.data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) continue;

      const results = JSON.parse(jsonMatch[0]);
      for (const item of results) {
        const srcFile = item.filename;
        if (!fs.existsSync(path.join(inboxDir, srcFile))) continue;

        const destDir = path.join(COMMON_DIR, item.category);
        fs.mkdirSync(destDir, { recursive: true });

        const destName = item.newName || srcFile;
        fs.renameSync(path.join(inboxDir, srcFile), path.join(destDir, destName));

        manifest[destName] = {
          category: item.category,
          description: item.description,
          tags: item.tags || [],
          businessTypes: item.businessTypes || [],
          originalName: srcFile
        };
        sorted++;
        send({ progress: `Sorted: ${srcFile} → ${item.category}/${destName}` });
      }
    } catch (e) {
      send({ progress: `Error analyzing batch: ${e.message}` });
    }
  }

  saveManifest(manifest);
  send({ done: true, sorted });
  res.end();
});

// ─── Perplexity Contact Enrichment ───────────────────────────────────────────

router.post('/enrich/social', async (req, res) => {
  const { name, address, neighborhood, city, phone } = req.body;
  if (!name) return res.status(400).json({ error: 'Business name required' });

  const location = [neighborhood, city].filter(Boolean).join(', ') || address || '';

  const prompt = `You are a business contact hunter. Find ALL contact info for this business.

Input: "${name}" ${location ? `in ${location}, Greece` : ''}
${phone ? `Known phone: ${phone}` : ''}

GOAL: Find ALL contact info by searching the top 10 most relevant links and extracting data from them.

RULES:
- Search broadly for DIRECTLY relevant results (social media profiles, Greek directories, review sites)
- Check EVERY promising result for emails, phones, social media links
- Output ALL finds — even partial
- Handle Greek characters properly
- Prioritize: Facebook pages, Instagram profiles, vrisko.gr, xo.gr, 11888.gr, directories

STEPS:
1. Search for "${name}" and find the top 10 relevant URLs
2. For each URL, extract: phone numbers (+30...), email addresses (@), social media links, website
3. Aggregate all unique findings

End your response with a JSON object:
{"email":null,"instagram":null,"facebook":null,"tiktok":null,"tripadvisor":null,"efood":null,"wolt":null,"booking":null,"website":null,"phone2":null,"notes":"sources and what you found"}`;

  try {
    const response = await axios.post('https://api.perplexity.ai/chat/completions', {
      model: 'sonar-large-online',
      messages: [
        { role: 'system', content: 'You are a business contact hunter. Search the web thoroughly for business contact information. Check Facebook, Instagram, Greek directories (vrisko.gr, xo.gr, 11888.gr), and any other relevant sources. Report everything you find. End with a JSON object.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.0
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const text = response.data.choices?.[0]?.message?.content || '';
    console.log('Perplexity raw response:', text);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.json({ found: false, raw: text });

    const parsed = JSON.parse(jsonMatch[0]);
    const result = Object.fromEntries(
      Object.entries(parsed).filter(([, v]) => v && v !== 'null' && v !== null)
    );
    res.json({ found: Object.keys(result).length > 0, data: result });
  } catch (e) {
    console.error('Perplexity enrichment error:', e.response?.data || e.message);
    res.status(500).json({ error: e.response?.data?.error?.message || e.message });
  }
});

// ─── Config check ────────────────────────────────────────────────────────────

router.get('/config', (req, res) => {
  res.json({
    hasGoogle:    !!process.env.GOOGLE_PLACES_API_KEY,
    hasPerplexity:!!process.env.PERPLEXITY_API_KEY,
    hasSmtp:      !!process.env.SMTP_HOST && !!process.env.SMTP_USER,
    hasAnthropic: !!process.env.ANTHROPIC_API_KEY,
    fromName:     process.env.FROM_NAME || ''
  });
});

module.exports = router;
