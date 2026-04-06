#!/usr/bin/env node
// scripts/setup.js — run once with: npm run setup
const fs = require('fs')
const path = require('path')
const readline = require('readline')

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const ask = (q, def = '') => new Promise(r =>
  rl.question(def ? `${q} [${def}]: ` : `${q}: `, a => r(a.trim() || def))
)

async function main() {
  console.log('\n╔══════════════════════════════════════╗')
  console.log('║     LeadForge — First-time Setup     ║')
  console.log('╚══════════════════════════════════════╝\n')
  console.log('This creates a .env file with your API keys.\n')

  const anthropic = await ask('Anthropic API Key (from console.anthropic.com)')
  const google = await ask('Google Places API Key (from console.cloud.google.com)')
  const hunter = await ask('Hunter.io API Key (from hunter.io/api) — press Enter to skip for now', '')
  const smtpHost = await ask('SMTP Host', 'smtp.gmail.com')
  const smtpPort = await ask('SMTP Port', '587')
  const smtpUser = await ask('SMTP Username (your email address)')
  const smtpPass = await ask('SMTP Password or App Password')
  const fromName = await ask('Your name (shows as email sender)')

  const env = [
    `ANTHROPIC_API_KEY=${anthropic}`,
    `GOOGLE_PLACES_API_KEY=${google}`,
    `HUNTER_API_KEY=${hunter}`,
    `SMTP_HOST=${smtpHost}`,
    `SMTP_PORT=${smtpPort}`,
    `SMTP_USER=${smtpUser}`,
    `SMTP_PASS=${smtpPass}`,
    `FROM_NAME=${fromName}`,
    ''
  ].join('\n')

  const envPath = path.join(__dirname, '..', '.env')
  fs.writeFileSync(envPath, env)

  console.log('\n✓ Saved to .env\n')
  console.log('Next steps:')
  console.log('  npm install     ← install dependencies (~2 min, downloads Chromium)')
  console.log('  npm start       ← launches the app\n')
  rl.close()
}

main().catch(e => { console.error(e); process.exit(1) })
