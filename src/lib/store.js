// src/lib/store.js
// All data lives in localStorage. Simple, zero-server, instant.

const LEADS_KEY  = 'lf_leads'
const TMPLS_KEY  = 'lf_templates'

// ── Leads ──────────────────────────────────────────────────────────────────

export function getLeads() {
  try { return JSON.parse(localStorage.getItem(LEADS_KEY) || '[]') } catch { return [] }
}

export function saveLeads(leads) {
  localStorage.setItem(LEADS_KEY, JSON.stringify(leads))
  // Auto-backup to disk
  fetch('/proxy/backup/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leads })
  }).catch(() => {})
}

export function getLead(id) {
  return getLeads().find(l => l.id === id) || null
}

export function upsertLead(lead) {
  const leads = getLeads()
  const idx = leads.findIndex(l => l.id === lead.id)
  if (idx >= 0) leads[idx] = { ...leads[idx], ...lead }
  else leads.unshift(lead)
  saveLeads(leads)
  return lead
}

export function upsertLeads(incoming) {
  // Merge new leads in, don't overwrite existing ones
  const existing = getLeads()
  const existingIds = new Set(existing.map(l => l.id))
  const fresh = incoming.filter(l => !existingIds.has(l.id))
  saveLeads([...fresh, ...existing])
  return { added: fresh.length, total: fresh.length + existing.length }
}

export function updateLead(id, fields) {
  const leads = getLeads()
  const idx = leads.findIndex(l => l.id === id)
  if (idx < 0) return null
  leads[idx] = { ...leads[idx], ...fields }
  saveLeads(leads)
  return leads[idx]
}

export function deleteLead(id) {
  saveLeads(getLeads().filter(l => l.id !== id))
}

export function getStats() {
  const leads = getLeads()
  const n = leads.length
  return {
    total:      n,
    new:        leads.filter(l => l.stage === 'new').length,
    emailed:    leads.filter(l => l.stage === 'emailed').length,
    inProgress: leads.filter(l => l.stage === 'in_progress').length,
    sitesBuilt: leads.filter(l => l.stage === 'site_built').length,
    closed:     leads.filter(l => l.stage === 'closed').length,
    withEmail:  leads.filter(l => l.email).length,
    withPhone:  leads.filter(l => l.phone).length,
    avgRating:  n ? (leads.reduce((s, l) => s + (l.rating || 0), 0) / n).toFixed(1) : '—'
  }
}

export function exportCsv() {
  const leads = getLeads()
  const headers = ['Name','Category','Address','Neighborhood','Rating','Reviews','Phone','Email','Stage','Notes','Google Maps','Demo URL']
  const rows = leads.map(l => [
    l.name, l.category, l.address, l.neighborhood,
    l.rating, l.reviewCount, l.phone||'', l.email||'',
    l.stage, l.notes||'', l.googleMapsUrl||'', l.demoUrl||''
  ].map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(','))
  const csv = [headers.join(','), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'leads.csv' })
  a.click()
}

// ── Templates ──────────────────────────────────────────────────────────────

export function getTemplates() {
  try {
    const stored = localStorage.getItem(TMPLS_KEY)
    return stored ? JSON.parse(stored) : DEFAULT_TEMPLATES
  } catch { return DEFAULT_TEMPLATES }
}

export function saveTemplates(templates) {
  localStorage.setItem(TMPLS_KEY, JSON.stringify(templates))
}

export function fillTemplate(template, lead, extras = {}) {
  const vars = {
    business_name:       lead.name || '',
    category:            lead.category || '',
    rating:              String(lead.rating || ''),
    review_count:        String(lead.reviewCount || ''),
    neighborhood:        lead.neighborhood || '',
    top_review_snippet:  (lead.reviewSnippet || '').slice(0, 100),
    demo_link:           extras.demoLink || lead.demoUrl || '[add demo link]',
    screenshot_url:      extras.screenshotUrl || '',
    your_name:           extras.yourName || '',
    ...extras
  }
  let out = template
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v)
  }
  return out
}

const DEFAULT_TEMPLATES = {
  cold: {
    name: 'Cold Outreach — First touch',
    subject: 'A website for {{business_name}} — quick idea',
    body: `Hi there,

I came across {{business_name}} while looking for the best {{category}} spots in {{neighborhood}}. Your {{review_count}} reviews and {{rating}}-star rating genuinely stood out — one customer even wrote: "{{top_review_snippet}}".

I noticed you don't have a website. Given the reputation you've built, that feels like a missed opportunity — a lot of new customers search online before they ever visit.

I put together a quick mockup of what a site for {{business_name}} could look like:
→ {{demo_link}}

No commitment, I just wanted to show you what's possible. Happy to chat if you're curious.

Best,
{{your_name}}`
  },
  followup: {
    name: 'Follow-up — With screenshots',
    subject: 'Re: {{business_name}} — did you get a chance to look?',
    body: `Hi,

Following up on my message from last week about a website for {{business_name}}.

I've gone ahead and built out a proper first draft — you can see it here:
→ {{demo_link}}

I've attached a couple of screenshots so you can get a feel for it without even clicking. Happy to tweak colours, copy, photos, anything you'd like.

Would you be up for a quick call this week?

{{your_name}}`
  },
  short: {
    name: 'Short & direct',
    subject: '{{business_name}} — a website idea',
    body: `Hi,

{{business_name}} has {{review_count}} great reviews and no website. I built you a demo:
→ {{demo_link}}

Worth a look?

{{your_name}}`
  },
  local: {
    name: 'Local angle',
    subject: 'The best {{category}} in {{neighborhood}} deserves a proper website',
    body: `Hi,

I'm a web designer based locally and I've been following {{business_name}} for a while — {{review_count}} reviews and {{rating}} stars doesn't happen by accident.

I noticed you don't have a website, which means a lot of people searching online are probably finding your competitors instead of you.

I built a demo in about a day:
→ {{demo_link}}

Let me know what you think — happy to refine it together.

{{your_name}}`
  }
}

// ── Assets Library ─────────────────────────────────────────────────────────

const ASSETS_KEY = 'lf_assets'

export function getAssets() {
  try { return JSON.parse(localStorage.getItem(ASSETS_KEY) || '[]') } catch { return [] }
}

export function saveAssets(assets) {
  localStorage.setItem(ASSETS_KEY, JSON.stringify(assets))
}

export function addAsset(asset) {
  const assets = getAssets()
  const newAsset = { ...asset, id: `asset_${Date.now()}`, createdAt: new Date().toISOString() }
  assets.unshift(newAsset)
  saveAssets(assets)
  return newAsset
}

export function updateAsset(id, fields) {
  const assets = getAssets()
  const idx = assets.findIndex(a => a.id === id)
  if (idx < 0) return null
  assets[idx] = { ...assets[idx], ...fields }
  saveAssets(assets)
  return assets[idx]
}

export function deleteAsset(id) {
  saveAssets(getAssets().filter(a => a.id !== id))
}

// Builds the assets section appended to a Kiro brief
export function buildAssetsBlock(selectedIds) {
  const assets = getAssets().filter(a => selectedIds.includes(a.id))
  if (!assets.length) return ''

  const byType = {
    snippet:  assets.filter(a => a.type === 'snippet'),
    palette:  assets.filter(a => a.type === 'palette'),
    image:    assets.filter(a => a.type === 'image'),
    url:      assets.filter(a => a.type === 'url'),
  }

  let block = `\n\n═══════════════════════════════════════════\nASSETS & REFERENCES TO USE\n═══════════════════════════════════════════\n`

  if (byType.snippet.length) {
    block += `\n── Code Snippets / Components ──\nReuse or adapt these in the build:\n\n`
    byType.snippet.forEach(a => {
      block += `[${a.name}]\n${a.content}\n\n`
    })
  }

  if (byType.palette.length) {
    block += `── Color Palettes & Typography ──\n`
    byType.palette.forEach(a => {
      block += `[${a.name}]\n${a.content}\n\n`
    })
  }

  if (byType.image.length) {
    block += `── Images & Logos ──\nThese are available as base64 data URIs or will be provided separately:\n`
    byType.image.forEach(a => {
      block += `- ${a.name}: ${a.filename || 'see attached'}\n`
      if (a.instructions) block += `  Instructions: ${a.instructions}\n`
    })
    block += `\n`
  }

  if (byType.url.length) {
    block += `── Reference / Inspiration Sites ──\nStudy these for design direction, layout patterns, and UX decisions:\n`
    byType.url.forEach(a => {
      block += `- ${a.name}: ${a.url}\n`
      if (a.notes) block += `  What to borrow: ${a.notes}\n`
    })
    block += `\n`
  }

  return block
}

// Social field labels for display
export const SOCIAL_META = {
  email:       { label: 'Email',        icon: '📧', color: 'green' },
  phone:       { label: 'Phone',        icon: '📞', color: 'amber' },
  phone2:      { label: 'Phone 2',      icon: '📞', color: 'amber' },
  instagram:   { label: 'Instagram',    icon: '📸', color: 'blue'  },
  facebook:    { label: 'Facebook',     icon: '👤', color: 'blue'  },
  tiktok:      { label: 'TikTok',       icon: '🎵', color: 'gray'  },
  website:     { label: 'Website',      icon: '🌐', color: 'gray'  },
  tripadvisor: { label: 'TripAdvisor',  icon: '🦉', color: 'green' },
  booking:     { label: 'Booking.com',  icon: '🏨', color: 'blue'  },
  efood:       { label: 'e-food',       icon: '🍔', color: 'amber' },
  wolt:        { label: 'Wolt',         icon: '🛵', color: 'blue'  },
}


// ── Lead Scoring ───────────────────────────────────────────────────────────

const CATEGORY_SCORES = {
  'dental clinics': 100, 'medical clinics': 95, 'pediatricians': 90,
  'law firms': 95, 'accountants': 90, 'notaries': 85,
  'hotels': 88, 'guesthouses': 85, 'boutique hotels': 88,
  'real estate agencies': 85,
  'physiotherapy clinics': 82,
  'hair salons': 75, 'beauty salons': 75, 'nail studios': 70, 'barbershops': 70,
  'gyms': 72, 'fitness studios': 72, 'yoga studios': 68, 'pilates studios': 68,
  'auto repair shops': 70, 'car washes': 60, 'tire shops': 60,
  'architecture firms': 72, 'interior designers': 72,
  'wedding planners': 65, 'event venues': 68,
  'pet grooming': 60, 'veterinary clinics': 65,
  'tattoo studios': 55, 'piercing studios': 50,
  'plumbers': 50, 'electricians': 50, 'locksmiths': 45,
  'opticians': 45, 'pharmacies': 40,
  'private tutors': 42, 'language schools': 48,
}

export function scoreLead(lead) {
  const cat = (lead.category || '').toLowerCase()
  const catScore = CATEGORY_SCORES[cat] || 50
  // Review count bonus: logarithmic so 500 reviews isn't 10x better than 50
  const reviewBonus = Math.min(Math.log10(Math.max(lead.reviewCount || 1, 1)) * 15, 40)
  // Rating bonus
  const ratingBonus = ((lead.rating || 0) - 3.5) * 10
  // Has contact info bonus
  const contactBonus = (lead.email ? 10 : 0) + (lead.phone ? 5 : 0)
  return Math.round(catScore + reviewBonus + ratingBonus + contactBonus)
}

// ── Slug helper ────────────────────────────────────────────────────────────

export function toSlug(name) {
  return (name || 'site').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50)
}
