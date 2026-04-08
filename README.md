# ⚡ LeadsForger v2 — Local Edition

No server. No database. No auth. Just `npm start` and go.

---

## Quick Start

```bash
# 1. Unzip and enter the folder
cd leadforge

# 2. Run the setup wizard (enter your API keys)
npm run setup

# 3. Install dependencies (~2 min — downloads Chromium for screenshots)
npm install

# 4. Start the app
npm start
```

Browser opens automatically at **http://localhost:5173**

---

## What runs when you do `npm start`

Two processes launch together:
- **Vite dev server** on port 5173 — the React UI
- **Local proxy** on port 3001 — handles API calls (Google, Hunter, email, screenshots)

The proxy keeps your API keys off the browser and handles CORS.
It only listens on `localhost` — nothing is exposed to the internet.

---

## The Workflow

```
1. Search       → Google Places finds businesses (no website, 4★+, 150+ reviews)
2. Enrich       → Hunter.io + AI finds email addresses & social media
3. Brief        → Generate a Kiro prompt for the business
4. Build        → Paste brief into Kiro chat → V1 website built in your workspace
5. Preview      → Run the site locally to check it
6. Deploy       → Push to Vercel (free)
7. Screenshot   → Paste Vercel URL → Puppeteer captures desktop + mobile shots
8. Email        → Template auto-filled → review → send
9. Follow up    → Close deal, hand over site
```

---

## API Keys

### Google Places API — FREE (you won't exceed the limit)
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Enable **Places API** (the legacy one)
3. Credentials → Create API Key
4. Free tier: $200/month credit ≈ thousands of searches

### Hunter.io — €34/month for real use
1. Sign up at [hunter.io](https://hunter.io)
2. Go to API → copy your key
3. Free: 25 searches/month (good for testing)
4. Starter (€34/mo): 500 searches/month — start here

### SMTP — Gmail App Password (free)
1. Enable 2-factor auth on Gmail
2. myaccount.google.com → Security → App Passwords → create one for "Mail"
3. Settings: `smtp.gmail.com`, port `587`, your email, the 16-char app password

---

## Project Structure

```
leadforge/
├── .env                  ← Your API keys (created by setup wizard)
├── package.json          ← Single npm start launches everything
├── vite.config.js        ← Proxies /proxy/* → localhost:3001
├── index.html
├── proxy/
│   └── index.js          ← Tiny Express server (CORS + API + email + Puppeteer)
├── scripts/
│   ├── setup.js          ← Interactive setup wizard
│   └── screenshot.js     ← CLI screenshot tool (alternative to UI)
├── screenshots/          ← Puppeteer output (auto-created)
├── data/                 ← (unused in v2 — data lives in localStorage)
└── src/
    ├── App.jsx
    ├── index.css
    ├── main.jsx
    ├── lib/
    │   ├── api.js         ← All fetch calls to the proxy
    │   ├── store.js       ← localStorage data layer (leads + templates)
    │   └── brief.js       ← Kiro prompt generator
    └── components/  /pages/
        ← React UI (SearchPage, LeadsPage, EmailPage, BriefPage, SettingsPage, AssetsPage, LeadDrawer)
```

---

## CLI Screenshot (alternative)

If you prefer not to use the UI for screenshots:

```bash
npm run screenshot -- --url https://your-site.vercel.app --id lead_name
```

Saves 3 files to `/screenshots/`: desktop hero, full page, mobile.

---

## Backing Up Your Leads

Leads live in your browser's `localStorage`. To back them up:
- Use **Export CSV** on the Lead List page anytime
- The CSV includes all lead info, contact details, stage, notes, demo URL

To restore from CSV: not yet automated — but all the raw data is there if needed.

---

## Tips

- **Search one city + one category at a time** for cleanest results
- **Hunter hit rate** for Greek small businesses: ~40–55%. Higher for established businesses (dental, law, hotels)
- **Don't send more than 50–80 cold emails/day** — Gmail will flag you as spam
- **Personalise before sending** — the template pre-fills everything but the body always benefits from one human touch
- **Follow up once** — the template with screenshots attached is often the one that converts

---

## Restarting / Updating

```bash
# Stop: Ctrl+C
# Start again:
npm start

# Update API keys:
npm run setup   # or just edit .env directly
```
