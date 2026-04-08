// proxy/index.js — tiny local-only proxy server
// Handles: CORS for Google/Hunter APIs, email sending, Puppeteer screenshots
// Runs on port 3001, only accessible from localhost

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })
const express = require('express')
const cors = require('cors')
const axios = require('axios')
const nodemailer = require('nodemailer')
const fs = require('fs')
const path = require('path')

const app = express()
app.use(cors({ origin: 'http://localhost:5173' }))
app.use(express.json({ limit: '10mb' }))

// Serve screenshots statically
const SHOTS_DIR = path.join(__dirname, '..', 'screenshots')
app.use('/proxy/screenshots', express.static(SHOTS_DIR))

// ─── Google Places ──────────────────────────────────────────────────────────

app.post('/proxy/places/search', async (req, res) => {
  const { query, pagetoken } = req.body
  try {
    const params = { query, key: process.env.GOOGLE_PLACES_API_KEY, language: 'en' }
    if (pagetoken) params.pagetoken = pagetoken
    const { data } = await axios.get('https://maps.googleapis.com/maps/api/place/textsearch/json', { params })
    res.json(data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/proxy/places/details', async (req, res) => {
  const { place_id } = req.body
  const fields = 'name,formatted_address,formatted_phone_number,international_phone_number,website,rating,user_ratings_total,reviews,types,url,opening_hours,business_status,photos'
  try {
    const { data } = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', {
      params: { place_id, fields, key: process.env.GOOGLE_PLACES_API_KEY, language: 'en' }
    })
    res.json(data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── Google Places Photos ────────────────────────────────────────────────────

app.get('/proxy/places/photo', async (req, res) => {
  const { ref, maxwidth } = req.query
  if (!ref) return res.status(400).json({ error: 'Photo reference required' })
  try {
    const { data } = await axios.get('https://maps.googleapis.com/maps/api/place/photo', {
      params: { photoreference: ref, maxwidth: maxwidth || 800, key: process.env.GOOGLE_PLACES_API_KEY },
      responseType: 'arraybuffer'
    })
    res.set('Content-Type', 'image/jpeg')
    res.set('Cache-Control', 'public, max-age=86400')
    res.send(data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── Vision Analysis — analyze business photos for brief generation ──────────

app.post('/proxy/analyze/photos', async (req, res) => {
  const { photoRefs, customPhotos, businessName, category, slug } = req.body

  const images = []

  // If we have a slug, read ALL photos from the lead's folder — that's the source of truth
  if (slug) {
    const photosDir = path.join(SITES_DIR, slug, 'photos')
    if (fs.existsSync(photosDir)) {
      const files = fs.readdirSync(photosDir).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f)).sort()
      for (const file of files) {
        try {
          const imgData = fs.readFileSync(path.join(photosDir, file))
          const ext = path.extname(file).toLowerCase()
          const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
          images.push({ type: 'image', source: { type: 'base64', media_type: mime, data: imgData.toString('base64') } })
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
        })
        images.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: Buffer.from(data).toString('base64') } })
      } catch {}
    }
    for (const dataUri of (customPhotos || [])) {
      const match = dataUri.match(/^data:(image\/\w+);base64,(.+)$/)
      if (match) {
        images.push({ type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } })
      }
    }
  }

  if (!images.length) return res.status(400).json({ error: 'No photos found' })

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

The JSON must be valid. Only include assets where you have enough information. The "content" fields should be copy-pasteable code or detailed specs.`

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
    })

    const text = (response.data.content || []).filter(b => b.type === 'text').map(b => b.text).join('')

    // Extract structured assets from <assets> tags
    let extractedAssets = null
    const assetsMatch = text.match(/<assets>\s*([\s\S]*?)\s*<\/assets>/)
    if (assetsMatch) {
      try {
        extractedAssets = JSON.parse(assetsMatch[1])
      } catch (e) {
        console.error('Failed to parse extracted assets:', e.message)
      }
    }

    // Return analysis text (without the raw assets tag) + parsed assets
    const cleanText = text.replace(/<assets>[\s\S]*?<\/assets>/g, '').trim()
    res.json({ ok: true, analysis: cleanText, photoCount: images.length, assets: extractedAssets })
  } catch (e) {
    console.error('Vision analysis error:', e.response?.data || e.message)
    res.status(500).json({ error: e.response?.data?.error?.message || e.message })
  }
})

// ─── Hunter.io ───────────────────────────────────────────────────────────────

app.post('/proxy/hunter/domain', async (req, res) => {
  const { domain } = req.body
  try {
    const { data } = await axios.get('https://api.hunter.io/v2/domain-search', {
      params: { domain, api_key: process.env.HUNTER_API_KEY, limit: 5, type: 'generic' }
    })
    res.json(data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/proxy/hunter/find', async (req, res) => {
  const { businessName } = req.body
  const guesses = guessDomains(businessName)
  for (const domain of guesses) {
    try {
      const { data } = await axios.get('https://api.hunter.io/v2/domain-search', {
        params: { domain, api_key: process.env.HUNTER_API_KEY, limit: 5, type: 'generic' }
      })
      const emails = data?.data?.emails || []
      if (emails.length) {
        const best = emails.find(e =>
          ['info','contact','hello','mail','booking','reception'].some(p => e.value.startsWith(p + '@'))
        ) || emails[0]
        return res.json({ found: true, email: best.value, confidence: best.confidence, domain })
      }
    } catch {}
    await sleep(200)
  }
  res.json({ found: false })
})

app.get('/proxy/hunter/credits', async (req, res) => {
  try {
    const { data } = await axios.get('https://api.hunter.io/v2/account', {
      params: { api_key: process.env.HUNTER_API_KEY }
    })
    res.json(data?.data?.requests || {})
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── Email sending ───────────────────────────────────────────────────────────

app.post('/proxy/email/send', async (req, res) => {
  const { to, subject, body, attachments = [] } = req.body
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_PORT === '465',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    })
    await transporter.sendMail({
      from: `"${process.env.FROM_NAME}" <${process.env.SMTP_USER}>`,
      to, subject,
      text: body,
      html: toHtml(body),
      attachments: attachments.map((a, i) => ({
        filename: `website-preview-${i + 1}.png`,
        path: path.join(SHOTS_DIR, a),
        cid: `img${i}`
      }))
    })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/proxy/email/test', async (req, res) => {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_PORT === '465',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    })
    await transporter.verify()
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── Puppeteer screenshots ───────────────────────────────────────────────────

app.post('/proxy/screenshot', async (req, res) => {
  const { url, leadId } = req.body
  if (!url) return res.status(400).json({ error: 'URL required' })
  try {
    const puppeteer = require('puppeteer')
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    })
    const results = []
    const base = `${leadId}_${Date.now()}`

    // Desktop hero
    const desk = await browser.newPage()
    await desk.setViewport({ width: 1440, height: 900 })
    await desk.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })
    await sleep(1500)
    const d1 = `${base}_desktop.png`
    await desk.screenshot({ path: path.join(SHOTS_DIR, d1), clip: { x: 0, y: 0, width: 1440, height: 900 } })
    results.push(d1)

    // Full page
    const d2 = `${base}_full.png`
    await desk.screenshot({ path: path.join(SHOTS_DIR, d2), fullPage: true })
    results.push(d2)
    await desk.close()

    // Mobile
    const mob = await browser.newPage()
    await mob.setViewport({ width: 390, height: 844, isMobile: true })
    await mob.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })
    await sleep(1000)
    const d3 = `${base}_mobile.png`
    await mob.screenshot({ path: path.join(SHOTS_DIR, d3), clip: { x: 0, y: 0, width: 390, height: 844 } })
    results.push(d3)
    await mob.close()

    await browser.close()
    res.json({ ok: true, files: results })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── Puppeteer video capture — full site walkthrough ─────────────────────────

app.post('/proxy/video', async (req, res) => {
  const { url, leadId, slug } = req.body
  if (!url) return res.status(400).json({ error: 'URL required' })

  // Stream progress via SSE
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  const send = (msg) => res.write(`data: ${JSON.stringify(msg)}\n\n`)

  const outputDir = slug ? path.join(SITES_DIR, slug) : SHOTS_DIR
  fs.mkdirSync(outputDir, { recursive: true })

  try {
    const puppeteer = require('puppeteer')
    const { execSync } = require('child_process')
    send({ progress: 'Launching browser...' })
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    })

    const base = `${leadId || 'site'}_${Date.now()}`
    const results = []

    async function recordPage(page, viewport, label) {
      const framesDir = path.join(outputDir, `_frames_${label}`)
      fs.mkdirSync(framesDir, { recursive: true })

      let frameIndex = 0
      const FPS = 30
      const PX_PER_FRAME = 9  // ~270px/sec at 30fps

      async function captureFrame() {
        const buf = await page.screenshot({ type: 'jpeg', quality: 85 })
        const framePath = path.join(framesDir, `frame_${String(frameIndex++).padStart(5, '0')}.jpg`)
        fs.writeFileSync(framePath, buf)
      }

      async function scrollAndCapture(page) {
        await page.evaluate(() => window.scrollTo(0, 0))
        let pos = 0
        while (true) {
          const maxScroll = await page.evaluate(() => document.body.scrollHeight - window.innerHeight)
          if (pos >= maxScroll || maxScroll <= 0) break
          pos = Math.min(pos + PX_PER_FRAME, maxScroll)
          await page.evaluate((y) => window.scrollTo(0, y), pos)
          await captureFrame()
        }
        // Hold at bottom for 1 second
        for (let i = 0; i < FPS; i++) await captureFrame()
      }

      // Homepage
      send({ progress: `📹 ${label}: Scrolling homepage...` })
      await page.evaluate(() => window.scrollTo(0, 0))
      await captureFrame() // first frame at top
      await scrollAndCapture(page)

      // Find nav links
      const navLinks = await page.evaluate((baseUrl) => {
        const origin = new URL(baseUrl).origin
        const links = Array.from(document.querySelectorAll('nav a[href], header a[href]'))
        const seen = new Set()
        const currentPath = new URL(baseUrl).pathname
        return links.map(a => ({ href: a.href, text: a.textContent.trim() })).filter(({ href }) => {
          try {
            const u = new URL(href, baseUrl)
            if (u.origin !== origin) return false
            if (u.pathname === currentPath || u.pathname === '/') return false
            if (seen.has(u.pathname)) return false
            seen.add(u.pathname)
            return true
          } catch { return false }
        })
      }, url)

      // Visit each page
      for (let i = 0; i < navLinks.length; i++) {
        const { href, text } = navLinks[i]
        send({ progress: `📹 ${label}: Visiting "${text || 'page ' + (i+1)}" (${i+1}/${navLinks.length})...` })
        try {
          await page.goto(href, { waitUntil: 'networkidle2', timeout: 15000 })
          // Brief pause at top of new page
          for (let p = 0; p < 5; p++) await captureFrame()
          await scrollAndCapture(page)
        } catch {}
      }

      // Stitch with ffmpeg
      send({ progress: `🎬 ${label}: Stitching ${frameIndex} frames into video...` })
      const outFile = `${base}_${label}.mp4`
      const outPath = path.join(outputDir, outFile)
      try {
        execSync(`ffmpeg -y -framerate ${FPS} -i "${framesDir}/frame_%05d.jpg" -c:v libx264 -pix_fmt yuv420p -preset fast -crf 23 "${outPath}"`, { stdio: 'pipe' })
        results.push(outFile)
      } catch (e) {
        console.error('ffmpeg error:', e.message)
      }

      fs.rmSync(framesDir, { recursive: true, force: true })
      return navLinks.length
    }

    // Desktop
    send({ progress: '🖥️ Starting desktop recording...' })
    const desk = await browser.newPage()
    await desk.setViewport({ width: 1440, height: 900 })
    await desk.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })
    const pageCount = await recordPage(desk, { width: 1440, height: 900 }, 'desktop')
    await desk.close()

    // Mobile
    send({ progress: '📱 Starting mobile recording...' })
    const mob = await browser.newPage()
    await mob.setViewport({ width: 390, height: 844, isMobile: true })
    await mob.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })
    await recordPage(mob, { width: 390, height: 844 }, 'mobile')
    await mob.close()

    await browser.close()
    send({ done: true, files: results, pages: pageCount + 1 })
    res.end()
  } catch (e) {
    console.error('Video capture error:', e.message)
    send({ done: true, error: e.message, files: [], pages: 0 })
    res.end()
  }
})

// ─── Lead Folders — auto-created per lead in sites/ ─────────────────────────

const SITES_DIR = path.join(__dirname, '..', 'sites')

// Create a lead folder with photos/ and assets/ subdirs
app.post('/proxy/lead-folder/create', (req, res) => {
  const { slug } = req.body
  if (!slug) return res.status(400).json({ error: 'Slug required' })
  const dir = path.join(SITES_DIR, slug)
  fs.mkdirSync(path.join(dir, 'photos'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true })
  res.json({ ok: true, path: `sites/${slug}` })
})

// Delete a lead folder
app.post('/proxy/lead-folder/delete', (req, res) => {
  const { slug } = req.body
  if (!slug) return res.status(400).json({ error: 'Slug required' })
  const dir = path.join(SITES_DIR, slug)
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  res.json({ ok: true })
})

// List images in a lead's photos/ or assets/ folder
app.get('/proxy/lead-folder/images', (req, res) => {
  const { slug, folder } = req.query
  if (!slug || !folder) return res.status(400).json({ error: 'slug and folder required' })
  const dir = path.join(SITES_DIR, slug, folder)
  if (!fs.existsSync(dir)) return res.json({ files: [] })
  const files = fs.readdirSync(dir)
    .filter(f => /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(f))
    .sort()
  res.json({ files })
})

// Serve images from lead folders
app.use('/proxy/lead-images', express.static(SITES_DIR))

// Download Google Places photos into a lead's photos/ folder
app.post('/proxy/lead-folder/download-photos', async (req, res) => {
  const { slug, photoRefs } = req.body
  if (!slug || !photoRefs?.length) return res.status(400).json({ error: 'slug and photoRefs required' })
  const dir = path.join(SITES_DIR, slug, 'photos')
  fs.mkdirSync(dir, { recursive: true })
  const downloaded = []
  for (let i = 0; i < photoRefs.length; i++) {
    try {
      const { data } = await axios.get('https://maps.googleapis.com/maps/api/place/photo', {
        params: { photoreference: photoRefs[i], maxwidth: 1200, key: process.env.GOOGLE_PLACES_API_KEY },
        responseType: 'arraybuffer'
      })
      const filename = `google-${String(i + 1).padStart(2, '0')}.jpg`
      fs.writeFileSync(path.join(dir, filename), data)
      downloaded.push(filename)
    } catch {}
  }
  res.json({ ok: true, downloaded })
})

// Save the brief to the lead folder
app.post('/proxy/lead-folder/save-brief', (req, res) => {
  const { slug, brief } = req.body
  if (!slug || !brief) return res.status(400).json({ error: 'slug and brief required' })
  const dir = path.join(SITES_DIR, slug)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'BRIEF.md'), brief, 'utf-8')
  res.json({ ok: true })
})

// ─── Common Assets — inbox sorting via Claude vision ─────────────────────────

const COMMON_DIR = path.join(__dirname, '..', 'common-assets')
const MANIFEST_PATH = path.join(COMMON_DIR, 'manifest.json')

function loadManifest() {
  try { return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8')) } catch { return {} }
}
function saveManifest(m) { fs.writeFileSync(MANIFEST_PATH, JSON.stringify(m, null, 2)) }

// List inbox files
app.get('/proxy/common-assets/inbox', (req, res) => {
  const dir = path.join(COMMON_DIR, 'inbox')
  if (!fs.existsSync(dir)) return res.json({ files: [] })
  const files = fs.readdirSync(dir).filter(f => /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(f)).sort()
  res.json({ files })
})

// Serve common assets
app.use('/proxy/common-assets-files', express.static(COMMON_DIR))

// Get manifest
app.get('/proxy/common-assets/manifest', (req, res) => {
  res.json(loadManifest())
})

// Sort inbox — send all inbox images to Claude, categorize, move, update manifest
app.post('/proxy/common-assets/sort-inbox', async (req, res) => {
  const inboxDir = path.join(COMMON_DIR, 'inbox')
  if (!fs.existsSync(inboxDir)) return res.json({ sorted: 0 })

  const files = fs.readdirSync(inboxDir).filter(f => /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(f)).sort()
  if (!files.length) return res.json({ sorted: 0 })

  // Stream progress
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  const send = (msg) => res.write(`data: ${JSON.stringify(msg)}\n\n`)

  const manifest = loadManifest()
  let sorted = 0

  // Process in batches of 3 to stay within rate limits
  for (let i = 0; i < files.length; i += 3) {
    const batch = files.slice(i, i + 3)
    send({ progress: `Analyzing images ${i+1}-${Math.min(i+3, files.length)} of ${files.length}...` })

    const images = []
    const batchNames = []
    for (const file of batch) {
      try {
        const data = fs.readFileSync(path.join(inboxDir, file))
        const ext = path.extname(file).toLowerCase()
        const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
        images.push({ type: 'image', source: { type: 'base64', media_type: mime, data: data.toString('base64') } })
        batchNames.push(file)
      } catch {}
    }

    if (!images.length) continue

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

Return ONLY valid JSON array, no markdown.`

    try {
      let response
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
          })
          break
        } catch (err) {
          const isRateLimit = err.response?.status === 429 || (err.response?.data?.error?.message || '').includes('rate limit')
          if (isRateLimit && attempt < 2) {
            const waitSec = 65
            send({ progress: `⏳ Rate limited — waiting ${waitSec}s before retrying (attempt ${attempt+2}/3)...` })
            await sleep(waitSec * 1000)
          } else {
            throw err
          }
        }
      }

      const text = (response.data.content || []).filter(b => b.type === 'text').map(b => b.text).join('')
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (!jsonMatch) continue

      const results = JSON.parse(jsonMatch[0])
      for (const item of results) {
        const srcFile = item.filename
        if (!fs.existsSync(path.join(inboxDir, srcFile))) continue

        const destDir = path.join(COMMON_DIR, item.category)
        fs.mkdirSync(destDir, { recursive: true })

        const destName = item.newName || srcFile
        fs.renameSync(path.join(inboxDir, srcFile), path.join(destDir, destName))

        manifest[destName] = {
          category: item.category,
          description: item.description,
          tags: item.tags || [],
          businessTypes: item.businessTypes || [],
          originalName: srcFile
        }
        sorted++
        send({ progress: `Sorted: ${srcFile} → ${item.category}/${destName}` })
      }
    } catch (e) {
      send({ progress: `Error analyzing batch: ${e.message}` })
    }
  }

  saveManifest(manifest)
  send({ done: true, sorted })
  res.end()
})

// ─── Lead Backup — auto-save to disk ─────────────────────────────────────────

const BACKUP_PATH = path.join(__dirname, '..', 'data', 'leads-backup.json')

app.post('/proxy/backup/save', (req, res) => {
  const { leads } = req.body
  if (!leads) return res.status(400).json({ error: 'No leads provided' })
  fs.mkdirSync(path.dirname(BACKUP_PATH), { recursive: true })
  fs.writeFileSync(BACKUP_PATH, JSON.stringify(leads, null, 2))
  res.json({ ok: true, count: leads.length })
})

app.get('/proxy/backup/load', (req, res) => {
  if (!fs.existsSync(BACKUP_PATH)) return res.json({ leads: [] })
  try {
    const leads = JSON.parse(fs.readFileSync(BACKUP_PATH, 'utf-8'))
    res.json({ leads })
  } catch { res.json({ leads: [] }) }
})

// ─── Config check ────────────────────────────────────────────────────────────

app.get('/proxy/config', (req, res) => {
  res.json({
    hasGoogle:    !!process.env.GOOGLE_PLACES_API_KEY,
    hasPerplexity:!!process.env.PERPLEXITY_API_KEY,
    hasSmtp:      !!process.env.SMTP_HOST && !!process.env.SMTP_USER,
    hasAnthropic: !!process.env.ANTHROPIC_API_KEY,
    fromName:     process.env.FROM_NAME || ''
  })
})

// ─── Email batch queue ───────────────────────────────────────────────────────

const EMAIL_QUEUE_PATH = path.join(__dirname, '..', 'data', 'email-queue.json')

function loadQueue() {
  try { return JSON.parse(fs.readFileSync(EMAIL_QUEUE_PATH, 'utf-8')) } catch { return [] }
}
function saveQueue(q) {
  fs.mkdirSync(path.dirname(EMAIL_QUEUE_PATH), { recursive: true })
  fs.writeFileSync(EMAIL_QUEUE_PATH, JSON.stringify(q, null, 2))
}

// Add email to queue
app.post('/proxy/email/queue', (req, res) => {
  const { to, subject, body, leadId, leadName, attachments } = req.body
  if (!to || !subject || !body) return res.status(400).json({ error: 'to, subject, body required' })
  const queue = loadQueue()
  queue.push({ id: Date.now().toString(), to, subject, body, leadId, leadName, attachments: attachments || [], status: 'pending', queuedAt: new Date().toISOString() })
  saveQueue(queue)
  res.json({ ok: true, queueSize: queue.filter(e => e.status === 'pending').length })
})

// Get queue
app.get('/proxy/email/queue', (req, res) => {
  res.json({ queue: loadQueue() })
})

// Remove from queue
app.post('/proxy/email/queue/remove', (req, res) => {
  const { id } = req.body
  saveQueue(loadQueue().filter(e => e.id !== id))
  res.json({ ok: true })
})

// Clear sent emails from queue
app.post('/proxy/email/queue/clear-sent', (req, res) => {
  saveQueue(loadQueue().filter(e => e.status !== 'sent'))
  res.json({ ok: true })
})

// Send all pending — drip with delay between each
app.post('/proxy/email/send-batch', async (req, res) => {
  const { delaySeconds = 120 } = req.body // default 2 min between emails
  const queue = loadQueue()
  const pending = queue.filter(e => e.status === 'pending')
  if (!pending.length) return res.json({ sent: 0 })

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  const send = (msg) => res.write(`data: ${JSON.stringify(msg)}\n\n`)

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_PORT === '465',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  })

  let sent = 0
  for (let i = 0; i < pending.length; i++) {
    const email = pending[i]
    send({ progress: `Sending ${i+1}/${pending.length}: ${email.leadName || email.to}...` })
    try {
      await transporter.sendMail({
        from: `"${process.env.FROM_NAME}" <${process.env.SMTP_USER}>`,
        to: email.to, subject: email.subject,
        text: email.body, html: toHtml(email.body),
        attachments: (email.attachments || []).map((a, j) => ({
          filename: `website-preview-${j+1}.png`,
          path: path.join(SHOTS_DIR, a), cid: `img${j}`
        }))
      })
      email.status = 'sent'
      email.sentAt = new Date().toISOString()
      sent++
      send({ progress: `✓ Sent to ${email.to} (${sent}/${pending.length})` })
    } catch (e) {
      email.status = 'failed'
      email.error = e.message
      send({ progress: `✗ Failed: ${email.to} — ${e.message}` })
    }
    saveQueue(queue)
    // Wait between emails to avoid spam flags
    if (i < pending.length - 1) {
      send({ progress: `⏳ Waiting ${delaySeconds}s before next email...` })
      await sleep(delaySeconds * 1000)
    }
  }

  send({ done: true, sent, total: pending.length })
  res.end()
})


// ─── Perplexity Contact Enrichment ───────────────────────────────────────────

app.post('/proxy/enrich/social', async (req, res) => {
  const { name, address, neighborhood, city, phone, category } = req.body
  if (!name) return res.status(400).json({ error: 'Business name required' })

  const location = [neighborhood, city].filter(Boolean).join(', ') || address || ''

  const prompt = `Google search: "${name}" ${location}

From the search results, find any links to:
- Their Instagram page (instagram.com URL)
- Their Facebook page (facebook.com URL)
- Their TripAdvisor page
- Their e-food.gr listing
- Their Wolt listing
- Their Booking.com page
- Their website (if any)
- Their TikTok page
- Any email address you can see
- Any phone number different from ${phone || 'unknown'}

Just report what you find in the Google search results. Return ONLY a JSON object:
{"email":null,"instagram":null,"facebook":null,"tiktok":null,"tripadvisor":null,"efood":null,"wolt":null,"booking":null,"website":null,"phone2":null,"notes":"what you found"}`

  try {
    const response = await axios.post('https://api.perplexity.ai/chat/completions', {
      model: 'sonar',
      messages: [
        { role: 'system', content: 'Search the web and report what you find. Return only valid JSON. No markdown, no backticks, no explanation.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.0
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json'
      }
    })

    const text = response.data.choices?.[0]?.message?.content || ''
    console.log('Perplexity raw response:', text)
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return res.json({ found: false, raw: text })

    const parsed = JSON.parse(jsonMatch[0])
    const result = Object.fromEntries(
      Object.entries(parsed).filter(([, v]) => v && v !== 'null' && v !== null)
    )
    res.json({ found: Object.keys(result).length > 0, data: result })
  } catch (e) {
    console.error('Perplexity enrichment error:', e.response?.data || e.message)
    res.status(500).json({ error: e.response?.data?.error?.message || e.message })
  }
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

function categorySpecificPrompt(cat = '') {
  const c = (cat || '').toLowerCase()
  if (c.includes('restaurant') || c.includes('cafe') || c.includes('bakery') || c.includes('patisserie'))
    return `- What does the food presentation style look like? (rustic plating, fine dining, casual, street food)
- Describe the dining area layout (open, intimate, bar seating, outdoor terrace)
- Menu board style if visible (chalkboard, printed, digital, handwritten)
- Suggest how to present a menu section on the website (cards, grid, list with photos)`
  if (c.includes('hair') || c.includes('beauty') || c.includes('spa') || c.includes('nail') || c.includes('barber'))
    return `- Describe the salon/studio interior style (modern, vintage, luxe, industrial)
- What's the mirror/station setup like?
- Suggest how to present services & pricing on the website
- Suggest a gallery layout style that matches the vibe (masonry, carousel, before/after)`
  if (c.includes('gym') || c.includes('fitness') || c.includes('physio') || c.includes('yoga') || c.includes('pilates'))
    return `- Describe the equipment/space style (high-tech, raw/industrial, boutique, zen)
- What's the energy level? (intense, calm, motivational, clinical)
- Suggest how to present class schedules or services
- Suggest imagery style for the hero section`
  if (c.includes('dental') || c.includes('medical') || c.includes('clinic'))
    return `- Describe the clinical environment (sterile/modern, warm/welcoming, high-tech)
- Is there a waiting area visible? Describe its feel
- Suggest how to present the team/doctors section
- Suggest how to handle the booking/appointment CTA`
  if (c.includes('hotel') || c.includes('guest') || c.includes('boutique'))
    return `- Describe the room/lobby style (luxury, boutique, minimalist, traditional)
- What amenities are visible?
- Suggest how to present rooms/suites on the website
- Suggest a booking section layout`
  if (c.includes('law') || c.includes('account') || c.includes('notary'))
    return `- Describe the office environment (traditional, modern, prestigious)
- Suggest how to present practice areas/services
- Suggest a professional team section layout`
  return `- What are the key visual selling points of this space?
- Suggest the most important sections for this type of business website
- What should the hero section communicate immediately?`
}

function guessDomains(name) {
  const clean = name.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, '')
  const words = name.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().split(/\s+/)
  return [...new Set([
    `${clean}.gr`, `${clean}.com`,
    `${words.slice(0, 2).join('')}.gr`, `${words.slice(0, 2).join('')}.com`,
    `${words[0]}.gr`, `${words[0]}.com`
  ])]
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function toHtml(text) {
  const esc = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  const linked = esc.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" style="color:#1a73e8;">$1</a>')
  return `<div style="font-family:Georgia,serif;font-size:15px;line-height:1.8;color:#111;max-width:580px;margin:0 auto;padding:32px 0;">
    ${linked.split('\n').map(l => l.trim() ? `<p style="margin:0 0 12px">${l}</p>` : '<br/>').join('')}
  </div>`
}

app.listen(3001, () => console.log('🔌 LeadsForger proxy running on http://localhost:3001'))
