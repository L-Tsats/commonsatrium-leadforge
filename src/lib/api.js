// src/lib/api.js — API client for all server endpoints
// Replaces localStorage persistence with fetch calls to /api/*
// Includes global 401 interception → redirect to login

// ── Base Fetch Helper ──────────────────────────────────────────────────────

async function apiFetch(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase()
  const headers = { ...options.headers }

  if (['POST', 'PUT', 'PATCH'].includes(method) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(url, { ...options, headers })

  if (res.status === 401 && !url.includes('/api/auth/')) {
    window.location.href = '/'
    throw new Error('Authentication required')
  }

  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try {
      const body = await res.json()
      if (body.error) msg = body.error
    } catch {}
    throw new Error(msg)
  }

  return res
}

async function get(path) {
  const res = await apiFetch(path)
  return res.json()
}

async function post(path, body) {
  const res = await apiFetch(path, {
    method: 'POST',
    body: JSON.stringify(body)
  })
  return res.json()
}

async function put(path, body) {
  const res = await apiFetch(path, {
    method: 'PUT',
    body: JSON.stringify(body)
  })
  return res.json()
}

async function patch(path, body) {
  const res = await apiFetch(path, {
    method: 'PATCH',
    body: JSON.stringify(body)
  })
  return res.json()
}

async function del(path) {
  const res = await apiFetch(path, { method: 'DELETE' })
  return res.json()
}

// ── Auth ────────────────────────────────────────────────────────────────────

export async function login(username, password) {
  return post('/api/auth/login', { username, password })
}

export async function logout() {
  return post('/api/auth/logout', {})
}

export async function getMe() {
  return get('/api/auth/me')
}

// ── Leads ───────────────────────────────────────────────────────────────────

export async function getLeads() {
  return get('/api/leads')
}

export async function getLead(id) {
  return get(`/api/leads/${encodeURIComponent(id)}`)
}

export async function upsertLead(lead) {
  return post('/api/leads', lead)
}

export async function upsertLeads(leads) {
  return post('/api/leads/bulk', leads)
}

export async function updateLead(id, fields) {
  return patch(`/api/leads/${encodeURIComponent(id)}`, fields)
}

export async function deleteLead(id) {
  return del(`/api/leads/${encodeURIComponent(id)}`)
}

export async function getStats() {
  return get('/api/leads/stats')
}

export async function exportCsv() {
  const res = await apiFetch('/api/leads/export/csv')
  const blob = await res.blob()
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: 'leads.csv'
  })
  a.click()
  URL.revokeObjectURL(a.href)
}

// ── Templates ───────────────────────────────────────────────────────────────

export async function getTemplates() {
  return get('/api/templates')
}

export async function saveTemplates(templates) {
  return put('/api/templates', templates)
}

// ── Assets ──────────────────────────────────────────────────────────────────

export async function getAssets() {
  return get('/api/assets')
}

export async function addAsset(asset) {
  return post('/api/assets', asset)
}

export async function updateAsset(id, fields) {
  return patch(`/api/assets/${encodeURIComponent(id)}`, fields)
}

export async function deleteAsset(id) {
  return del(`/api/assets/${encodeURIComponent(id)}`)
}

// ── Email ───────────────────────────────────────────────────────────────────

export async function queueEmail(data) {
  return post('/api/email/queue', data)
}

export async function getEmailQueue() {
  return get('/api/email/queue')
}

export async function removeFromQueue(id) {
  return del(`/api/email/queue/${encodeURIComponent(id)}`)
}

export async function clearSentEmails() {
  return post('/api/email/queue/clear-sent', {})
}

export async function sendEmail(data) {
  return post('/api/email/send', data)
}

export async function testSmtp() {
  return post('/api/email/test-smtp', {})
}

// ── Backup ──────────────────────────────────────────────────────────────────

export async function exportBackup() {
  return get('/api/backup/export')
}

export async function importBackup(leads) {
  return post('/api/backup/import', leads)
}

// ── Google Places (Proxy) ───────────────────────────────────────────────────

export async function searchPlaces(query, pagetoken) {
  return post('/api/places/search', { query, pagetoken })
}

export async function getPlaceDetails(placeId) {
  return post('/api/places/details', { place_id: placeId })
}

export function getPlacePhotoUrl(ref, maxwidth = 800) {
  return `/api/places/photo?ref=${encodeURIComponent(ref)}&maxwidth=${maxwidth}`
}

// ── Hunter.io (Proxy) ──────────────────────────────────────────────────────

export async function findEmail(businessName) {
  return post('/api/hunter/find', { businessName })
}

export async function searchDomain(domain) {
  return post('/api/hunter/domain', { domain })
}

export async function getHunterCredits() {
  return get('/api/hunter/credits')
}

// ── Screenshots & Video (Proxy) ────────────────────────────────────────────

export async function takeScreenshot(url, leadId) {
  return post('/api/screenshot', { url, leadId })
}

// Alias for backward compatibility
export const captureScreenshot = takeScreenshot

// ── Analysis (Proxy) ───────────────────────────────────────────────────────

export async function analyzePhotos(data) {
  return post('/api/analyze/photos', data)
}

// ── Social Enrichment (Proxy) ──────────────────────────────────────────────

export async function enrichSocial(data) {
  return post('/api/enrich/social', data)
}

// ── Config ─────────────────────────────────────────────────────────────────

export async function getConfig() {
  return get('/api/config')
}

// ── Lead Folders ───────────────────────────────────────────────────────────

export async function createLeadFolder(slug) {
  return post('/api/lead-folder/create', { slug })
}

export async function deleteLeadFolder(slug) {
  return post('/api/lead-folder/delete', { slug })
}

export async function getLeadImages(slug, folder) {
  return get(`/api/lead-folder/images?slug=${encodeURIComponent(slug)}&folder=${encodeURIComponent(folder)}`)
}

export async function downloadPhotos(slug, photoRefs) {
  return post('/api/lead-folder/download-photos', { slug, photoRefs })
}

// Alias for backward compatibility
export const downloadLeadPhotos = downloadPhotos

export async function saveBrief(slug, brief) {
  return post('/api/lead-folder/save-brief', { slug, brief })
}

// ── Higher-level helpers (preserved from old api.js) ────────────────────────

export async function refreshLeadPhotos(lead) {
  const det = await getPlaceDetails(lead.id)
  const result = det.result || {}
  const photoRefs = (result.photos || []).map(p => p.photo_reference).filter(Boolean)
  return { photoRefs }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

export async function searchAndEnrich({ location, category, minRating, minReviews, maxResults }) {
  const query = `${category} in ${location}`
  let allRaw = []
  let pagetoken = null

  do {
    const data = await searchPlaces(query, pagetoken)
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      throw new Error(`Google Places error: ${data.status} — ${data.error_message || ''}`)
    }
    allRaw = allRaw.concat(data.results || [])
    pagetoken = data.next_page_token || null
    if (pagetoken && allRaw.length < maxResults) await sleep(2100)
  } while (pagetoken && allRaw.length < maxResults)

  const candidates = allRaw
    .filter(p => (p.rating || 0) >= minRating && (p.user_ratings_total || 0) >= minReviews)
    .slice(0, maxResults * 4)

  const leads = []
  for (const place of candidates) {
    if (leads.length >= maxResults) break
    try {
      const det = await getPlaceDetails(place.place_id)
      const result = det.result || {}
      if (result.website) { await sleep(80); continue }
      leads.push(formatLead(place, result, category))
    } catch {
      leads.push(formatLead(place, {}, category))
    }
    await sleep(80)
  }

  return leads
}

function formatLead(place, d, category) {
  const reviews = (d.reviews || [])
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 3)
    .map(r => ({ text: r.text, rating: r.rating, author: r.author_name, time: r.relative_time_description }))

  const addr = d.formatted_address || place.formatted_address || ''
  const parts = addr.split(',')
  const neighborhood = parts.length >= 2 ? parts[1].trim() : parts[0].trim()

  return {
    id:             place.place_id,
    name:           d.name || place.name,
    category:       category || (place.types?.[0] || '').replace(/_/g, ' '),
    address:        addr,
    neighborhood,
    phone:          d.formatted_phone_number || d.international_phone_number || null,
    website:        d.website || null,
    rating:         d.rating || place.rating || 0,
    reviewCount:    d.user_ratings_total || place.user_ratings_total || 0,
    topReviews:     reviews,
    reviewSnippet:  reviews[0]?.text?.slice(0, 120) || '',
    googleMapsUrl:  d.url || `https://www.google.com/maps/place/?q=place_id:${place.place_id}`,
    photoRefs:      (d.photos || place.photos || []).map(p => p.photo_reference).filter(Boolean),
    stage:          'new',
    email:          null,
    emailFound:     false,
    screenshotFiles:[],
    demoUrl:        '',
    notes:          '',
    slug:           (d.name || place.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50),
    createdAt:      new Date().toISOString()
  }
}

// ── Common Assets ──────────────────────────────────────────────────────────

export async function getInboxFiles() {
  return get('/api/common-assets/inbox')
}

export async function getAssetManifest() {
  return get('/api/common-assets/manifest')
}

export function filterManifestForCategory(manifest, category) {
  const cat = (category || '').toLowerCase()
  return Object.entries(manifest)
    .filter(([, info]) => {
      if (!info.businessTypes?.length) return true
      return info.businessTypes.some(bt => cat.includes(bt.toLowerCase()) || bt.toLowerCase().includes(cat))
    })
    .map(([file, info]) => ({ file, category: info.category, description: info.description, tags: info.tags }))
}
