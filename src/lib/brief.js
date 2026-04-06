// src/lib/brief.js

export function generateBrief(lead, { visionAnalysis, folderPhotos, commonAssets, personalNotes, customColors } = {}) {
  const reviews = (lead.topReviews || [])
    .map((r, i) => `  ${i+1}. "${(r.text||'').slice(0,160)}" — ${r.rating}★ by ${r.author||'customer'}`)
    .join('\n') || '  No reviews captured'

  const cat = (lead.category || '').replace(/\b\w/g, c => c.toUpperCase())

  return `Build a single-page homepage for a local ${cat.toLowerCase() || 'business'}.
One page, sections stacked vertically, no routing, no other pages.
Use Next.js 14 (App Router) + Tailwind CSS. Mobile-first, visually stunning.
${visionAnalysis ? `
IMPORTANT: A visual analysis of this business's real photos is included below.
This is your PRIMARY design reference — match the actual vibe, colors, and feel.` : ''}

═══════════════════════════════════════════
BUSINESS PROFILE
═══════════════════════════════════════════
Name:         ${lead.name}
Category:     ${cat}
Address:      ${lead.address}
Neighborhood: ${lead.neighborhood}
Phone:        ${lead.phone || 'not provided'}
Email:        ${lead.email || 'not provided'}
Google Maps:  ${lead.googleMapsUrl}
Rating:       ${lead.rating} / 5  (${lead.reviewCount} reviews)

═══════════════════════════════════════════
TOP REVIEWS — use for social proof
═══════════════════════════════════════════
${reviews}

Key themes: ${extractThemes(lead.topReviews)}

═══════════════════════════════════════════
DESIGN DIRECTION
═══════════════════════════════════════════
${visionAnalysis ? `${visionAnalysis}
` : `Tone:    ${tone(lead.category)}
Palette: ${palette(lead.category)}`}
Fonts:   ${visionAnalysis ? 'Use the font pairing from the photo analysis above' : 'Choose characterful, non-generic fonts — avoid Inter, Roboto, system-ui'}
${customColors?.length ? `
CUSTOM COLOR PALETTE (use these instead of auto-detected colors):
${customColors.map((c, i) => `  Color ${i+1}: ${c}`).join('\n')}
Use these as the primary palette. Assign them to: primary, secondary, accent, background, text as you see fit.` : ''}
Feel:    Premium local business. Warm and human, not corporate or template-like.

═══════════════════════════════════════════
HOMEPAGE SECTIONS (top to bottom)
═══════════════════════════════════════════
${homepageSections(lead.category, lead)}

═══════════════════════════════════════════
${cat.toUpperCase()}-SPECIFIC NOTES
═══════════════════════════════════════════
${businessTypeNotes(lead.category)}

═══════════════════════════════════════════
CONTENT VOICE
═══════════════════════════════════════════
- Warm, authentic, locally rooted — NOT generic AI copy
- Mention ${lead.reviewCount}+ happy customers prominently
- Concise — local customers want info fast
- Placeholder copy in English (client will localise)
${personalNotes ? `
═══════════════════════════════════════════
ADDITIONAL NOTES FROM THE DESIGNER
═══════════════════════════════════════════
${personalNotes}
` : ''}
═══════════════════════════════════════════
TECH
═══════════════════════════════════════════
- Next.js 14 App Router, Tailwind CSS, single page (page.tsx only)
- LOCAL PROTOTYPE for demo — not production
- No routing, no other pages, no deployment config
- No analytics, no SEO, no sitemap
- Focus 100% on visual quality — must look stunning
- Use images from photos/ folder and common-assets/ if available
${visionAnalysis && (folderPhotos?.length || lead.photoRefs?.length) ? `
═══════════════════════════════════════════
PHOTO ASSETS AVAILABLE
═══════════════════════════════════════════
${folderPhotos?.length ? `Photos in the photos/ folder:
${folderPhotos.map((f, i) => `  Photo ${i+1}: photos/${f}`).join('\n')}` : `Photos in the photos/ folder:
${lead.photoRefs.map((ref, i) => `  Photo ${i+1}: photos/google-${String(i+1).padStart(2,'0')}.jpg`).join('\n')}`}

Use the photo-by-photo asset map from DESIGN DIRECTION to place them.` : ''}
${commonAssets?.length ? `
═══════════════════════════════════════════
COMMON STOCK ASSETS AVAILABLE
═══════════════════════════════════════════
These stock images from the shared library match this business type.
They are in the common-assets/ folder (copy what you need into the project):

${commonAssets.map(a => `  ${a.category}/${a.file} — ${a.description}`).join('\n')}

Use these for sections where no business-specific photo is available.
Business photos from photos/ always take priority over stock.` : ''}

Build everything in this folder. One page, make it beautiful.
Ask me before making major design decisions.`
}

function homepageSections(cat = '', lead) {
  const c = (cat || '').toLowerCase()
  const base = `1. HERO — Full-width, striking. Business name + neighborhood as headline.
   "${lead.rating}★ from ${lead.reviewCount} customers" badge. Primary CTA button.
   ${lead.phone ? `Click-to-call: <a href="tel:${lead.phone}">` : ''}
2. SOCIAL PROOF — Pull quotes from top reviews, star rating prominently displayed.`

  if (c.includes('restaurant') || c.includes('cafe') || c.includes('bakery'))
    return `${base}
3. HIGHLIGHTS — 3-4 cards: signature dishes, atmosphere, what makes them special.
4. MENU PREVIEW — Top menu categories with a few items each. Clean grid or cards.
5. GALLERY — Best food/interior photos in a grid.
6. LOCATION & HOURS — Google Maps embed + opening hours + contact info.
7. FOOTER — Phone, address, social links, one final CTA.`

  if (c.includes('hair') || c.includes('beauty') || c.includes('spa') || c.includes('nail') || c.includes('barber'))
    return `${base}
3. SERVICES — Grid of services with brief descriptions. Prices if known.
4. GALLERY — Best work photos, interior shots.
5. TEAM — Stylist/therapist names and specialties (placeholder if unknown).
6. BOOKING CTA — Full-width "Book your appointment" section.
7. LOCATION & HOURS — Map embed + hours + contact.
8. FOOTER — Phone, address, Instagram link, final CTA.`

  if (c.includes('gym') || c.includes('fitness') || c.includes('yoga') || c.includes('pilates'))
    return `${base}
3. WHAT WE OFFER — Classes/services in a clean grid with icons.
4. FACILITIES — Photo gallery of the space and equipment.
5. PRICING — Membership tiers or session pricing (placeholder).
6. JOIN CTA — Full-width "Start your journey" section.
7. LOCATION & HOURS — Map + schedule + contact.
8. FOOTER — Phone, address, social links.`

  if (c.includes('physio') || c.includes('dental') || c.includes('medical') || c.includes('clinic'))
    return `${base}
3. SERVICES — Clean list of treatments/services with brief descriptions.
4. TEAM — Doctor/therapist profiles with credentials (placeholder).
5. WHY US — Trust signals: years of experience, certifications, equipment.
6. APPOINTMENT CTA — Full-width "Book your appointment" section.
7. LOCATION & HOURS — Map + hours + contact + parking info.
8. FOOTER — Phone, address, emergency contact if applicable.`

  if (c.includes('hotel') || c.includes('guest') || c.includes('boutique'))
    return `${base}
3. ROOMS — Room types with photos and key amenities (placeholder pricing).
4. AMENITIES — Icon grid of what's available.
5. GALLERY — Best photos of rooms, common areas, views.
6. BOOKING CTA — Full-width "Book your stay" section.
7. LOCATION — Map + nearby attractions + how to get there.
8. FOOTER — Phone, address, booking link.`

  if (c.includes('law') || c.includes('account') || c.includes('notary'))
    return `${base}
3. PRACTICE AREAS — Services in a professional grid with icons.
4. TEAM — Attorney/accountant profiles with credentials.
5. WHY US — Trust signals, years of practice, associations.
6. CONSULTATION CTA — Full-width "Schedule a consultation" section.
7. LOCATION — Map + office hours + contact.
8. FOOTER — Phone, address, professional links.`

  if (c.includes('auto') || c.includes('car') || c.includes('tire'))
    return `${base}
3. SERVICES — What they fix/service, with icons and brief descriptions.
4. GALLERY — Workshop photos, before/after if available.
5. BRANDS — Logos of brands they work with or certifications.
6. QUOTE CTA — Full-width "Get a quote" section.
7. LOCATION & HOURS — Map + hours + emergency contact.
8. FOOTER — Phone, address, final CTA.`

  if (c.includes('pet') || c.includes('vet'))
    return `${base}
3. SERVICES — Grooming packages or vet services with descriptions.
4. GALLERY — Happy pets, facility photos.
5. TEAM — Staff with qualifications.
6. BOOKING CTA — Full-width "Book appointment" section.
7. LOCATION & HOURS — Map + hours + emergency info for vets.
8. FOOTER — Phone, address, social links.`

  return `${base}
3. SERVICES — What they offer, clean grid with icons.
4. GALLERY — Best photos of their work/space.
5. ABOUT — Brief story, what makes them different.
6. CTA — Full-width call-to-action section.
7. LOCATION & HOURS — Map + hours + contact.
8. FOOTER — Phone, address, social links.`
}

function businessTypeNotes(cat = '') {
  const c = (cat || '').toLowerCase()
  if (c.includes('restaurant') || c.includes('cafe') || c.includes('bakery'))
    return `- Food photography should be prominent — use the best food shots as section backgrounds
- Opening hours are critical — display them clearly
- If on e-food/Wolt, add platform links as secondary CTAs`
  if (c.includes('hair') || c.includes('beauty') || c.includes('spa') || c.includes('nail') || c.includes('barber'))
    return `- Instagram link is essential — this industry lives on Instagram
- Before/after gallery if photos support it
- "Book appointment" must be unmissable — repeat it multiple times`
  if (c.includes('gym') || c.includes('fitness') || c.includes('yoga') || c.includes('pilates'))
    return `- Energy and motivation should come through in the design
- Class schedule or timetable section is important
- Transformation/results testimonials work best here`
  if (c.includes('dental') || c.includes('medical') || c.includes('clinic') || c.includes('physio'))
    return `- Trust and professionalism are paramount
- Credentials and certifications should be visible
- Avoid jargon — patients want clarity
- Appointment booking CTA is the primary conversion goal`
  if (c.includes('hotel') || c.includes('guest') || c.includes('boutique'))
    return `- Photos are everything — rooms, views, common areas
- "Book direct" messaging saves them platform commissions
- Location/attractions section helps with decision-making`
  if (c.includes('law') || c.includes('account') || c.includes('notary'))
    return `- Authority and trust are the design priorities
- Keep it clean, professional, no flashy elements
- Credentials and experience front and center`
  if (c.includes('auto') || c.includes('car') || c.includes('tire'))
    return `- Practical and straightforward design
- Service list with clear descriptions is key
- Emergency/quick contact info should be prominent`
  return `- Keep the design clean and professional
- Make the primary CTA obvious and repeated
- Photos of the actual space/work build trust`
}

function tone(cat = '') {
  const c = cat.toLowerCase()
  if (c.includes('restaurant')||c.includes('cafe')||c.includes('bakery'))
    return 'Warm, inviting, passionate — Mediterranean authenticity'
  if (c.includes('hair')||c.includes('beauty')||c.includes('spa')||c.includes('nail'))
    return 'Chic, personal, confident — premium without being cold'
  if (c.includes('gym')||c.includes('fitness')||c.includes('physio')||c.includes('sport'))
    return 'Energetic, professional, results-driven'
  if (c.includes('dental')||c.includes('medical')||c.includes('clinic'))
    return 'Reassuring, professional, patient-focused'
  if (c.includes('law')||c.includes('account'))
    return 'Authoritative, precise, trustworthy'
  return 'Professional, warm, authentic, locally rooted'
}

function palette(cat = '') {
  const c = cat.toLowerCase()
  if (c.includes('restaurant')||c.includes('cafe')||c.includes('bakery'))
    return 'Warm terracotta, deep olive, cream/ivory'
  if (c.includes('hair')||c.includes('beauty')||c.includes('spa'))
    return 'Champagne gold, blush, deep charcoal'
  if (c.includes('gym')||c.includes('fitness')||c.includes('physio'))
    return 'Slate/charcoal, electric teal, white'
  if (c.includes('dental')||c.includes('medical'))
    return 'Clean white, soft navy, mint accent'
  if (c.includes('hotel')||c.includes('guest'))
    return 'Sand, deep teal, gold accents'
  return 'Warm white, deep slate, one bold accent'
}

function extractThemes(reviews = []) {
  if (!reviews.length) return 'quality, friendly service'
  const text = reviews.map(r => r.text||'').join(' ').toLowerCase()
  const hits = []
  const checks = {
    'friendly staff':    ['friend','staff','kind','welcom','warm'],
    'great quality':     ['quality','excel','amaz','best','outstand'],
    'good value':        ['value','price','afford','reason','worth'],
    'professional':      ['profess','expert','experi','skill'],
    'fast service':      ['fast','quick','efficien','prompt'],
    'clean & tidy':      ['clean','tidy','hygien','spotless'],
  }
  for (const [theme, words] of Object.entries(checks)) {
    if (words.some(w => text.includes(w))) hits.push(theme)
  }
  return hits.slice(0,4).join(', ') || 'quality, service, professionalism'
}
