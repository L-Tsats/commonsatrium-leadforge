#!/usr/bin/env node
// scripts/screenshot.js
// Usage: npm run screenshot -- --url https://yoursite.com --id lead_abc123
require('dotenv').config()
const puppeteer = require('puppeteer')
const path = require('path')
const fs = require('fs')

const args = process.argv.slice(2)
const get = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null }

const url = get('--url')
const id  = get('--id') || 'manual'

if (!url) {
  console.error('Usage: npm run screenshot -- --url https://yoursite.com --id lead_id')
  process.exit(1)
}

const SHOTS_DIR = path.join(__dirname, '..', 'screenshots')
if (!fs.existsSync(SHOTS_DIR)) fs.mkdirSync(SHOTS_DIR)

async function capture() {
  console.log(`\n📸 Capturing screenshots of: ${url}\n`)
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  })

  const base = `${id}_${Date.now()}`
  const files = []

  // Desktop hero
  process.stdout.write('  Desktop hero...')
  const desk = await browser.newPage()
  await desk.setViewport({ width: 1440, height: 900 })
  await desk.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })
  await new Promise(r => setTimeout(r, 1500))
  const f1 = `${base}_desktop.png`
  await desk.screenshot({ path: path.join(SHOTS_DIR, f1), clip: { x: 0, y: 0, width: 1440, height: 900 } })
  files.push(f1); console.log(' ✓')

  // Full page
  process.stdout.write('  Full page...')
  const f2 = `${base}_full.png`
  await desk.screenshot({ path: path.join(SHOTS_DIR, f2), fullPage: true })
  files.push(f2); console.log(' ✓')
  await desk.close()

  // Mobile
  process.stdout.write('  Mobile...')
  const mob = await browser.newPage()
  await mob.setViewport({ width: 390, height: 844, isMobile: true })
  await mob.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })
  await new Promise(r => setTimeout(r, 1000))
  const f3 = `${base}_mobile.png`
  await mob.screenshot({ path: path.join(SHOTS_DIR, f3), clip: { x: 0, y: 0, width: 390, height: 844 } })
  files.push(f3); console.log(' ✓')
  await mob.close()

  await browser.close()

  console.log(`\n✓ Done! ${files.length} screenshots saved to /screenshots/\n`)
  files.forEach(f => console.log(`  ${f}`))
  console.log()
}

capture().catch(e => { console.error('Error:', e.message); process.exit(1) })
