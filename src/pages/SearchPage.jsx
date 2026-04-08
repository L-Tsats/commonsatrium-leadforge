import { useState } from 'react'
import { searchAndEnrich, createLeadFolder, downloadLeadPhotos, upsertLeads, exportCsv } from '../lib/api'
import { toSlug } from '../lib/store'
import { Btn, Card, PageHeader, Stat, Field, Stars, Badge, StageBadge, Spinner } from '../components/ui'
import LeadDrawer from '../components/LeadDrawer'
import MapPicker from '../components/MapPicker'

const CATS = [
  'Hair Salons','Beauty Salons','Nail Studios','Barbershops',
  'Gyms','Fitness Studios','Yoga Studios','Pilates Studios','Physiotherapy Clinics',
  'Dental Clinics','Medical Clinics','Pediatricians',
  'Law Firms','Accountants','Notaries',
  'Auto Repair Shops','Car Washes','Tire Shops',
  'Hotels','Boutique Hotels',
  'Pet Grooming','Veterinary Clinics',
  'Plumbers','Electricians','Locksmiths',
  'Tattoo Studios','Piercing Studios',
  'Opticians','Pharmacies',
  'Architecture Firms','Interior Designers',
  'Private Tutors','Language Schools',
  'Wedding Planners','Event Venues',
  'Real Estate Agencies',
]

// Categories that genuinely need a website — used for "Search All"
const PRIORITY_CATS = [
  'Hair Salons','Beauty Salons','Nail Studios','Barbershops',
  'Gyms','Fitness Studios','Yoga Studios','Pilates Studios','Physiotherapy Clinics',
  'Dental Clinics','Medical Clinics','Pediatricians',
  'Law Firms','Accountants','Notaries',
  'Auto Repair Shops','Car Washes','Tire Shops',
  'Hotels','Boutique Hotels',
  'Pet Grooming','Veterinary Clinics',
  'Plumbers','Electricians','Locksmiths',
  'Tattoo Studios','Piercing Studios',
  'Opticians','Pharmacies',
  'Architecture Firms','Interior Designers',
  'Private Tutors','Language Schools',
  'Wedding Planners','Event Venues',
  'Real Estate Agencies',
]

export default function SearchPage({ toast }) {
  const [form, setForm] = useState({ location:'', category:CATS[0], minRating:4.0, minReviews:50, maxResults:20 })
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState('')
  const [drawer, setDrawer] = useState(null)
  const [showMap, setShowMap] = useState(false)
  const [batchMode, setBatchMode] = useState(false)
  const [batchLocations, setBatchLocations] = useState('')

  const set = (k,v) => setForm(f => ({...f, [k]:v}))

  async function run() {
    if (!form.location) { toast('Enter a location first', 'error'); return }
    setLoading(true); setResults(null); setProgress('Searching Google Places...')
    try {
      const leads = await searchAndEnrich({ ...form })
      setProgress(`Found ${leads.length} leads — saving...`)
      const { added } = await upsertLeads(leads)
      setResults({ leads, added })
      toast(`✓ Found ${leads.length} leads, ${added} new`)
      // Create folders and download Google photos for new leads
      if (added > 0) {
        setProgress('Creating lead folders & downloading photos...')
        for (const lead of leads) {
          const slug = toSlug(lead.name)
          try {
            await createLeadFolder(slug)
            if (lead.photoRefs?.length) {
              await downloadLeadPhotos(slug, lead.photoRefs)
            }
          } catch {}
        }
      }
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setLoading(false); setProgress('')
    }
  }

  async function runAll() {
    if (!form.location) { toast('Enter a location first', 'error'); return }
    setLoading(true); setResults(null)
    const allLeads = []
    let totalAdded = 0

    for (let i = 0; i < PRIORITY_CATS.length; i++) {
      const cat = PRIORITY_CATS[i]
      setProgress(`Searching ${cat} (${i+1}/${PRIORITY_CATS.length})...`)
      try {
        const leads = await searchAndEnrich({ ...form, category: cat })
        if (leads.length) {
          const { added } = await upsertLeads(leads)
          totalAdded += added
          allLeads.push(...leads)
          // Create folders and download photos
          for (const lead of leads) {
            const slug = toSlug(lead.name)
            try {
              await createLeadFolder(slug)
              if (lead.photoRefs?.length) await downloadLeadPhotos(slug, lead.photoRefs)
            } catch {}
          }
        }
      } catch {}
    }

    setResults({ leads: allLeads, added: totalAdded })
    toast(`✓ Searched ${PRIORITY_CATS.length} categories — found ${allLeads.length} leads, ${totalAdded} new`)
    setLoading(false); setProgress('')
  }

  async function runBatch() {
    const locations = batchLocations.split('\n').map(l => l.trim()).filter(Boolean)
    if (!locations.length) { toast('Enter at least one location', 'error'); return }
    setLoading(true); setResults(null)
    const allLeads = []
    let totalAdded = 0
    const totalSteps = locations.length * PRIORITY_CATS.length
    let step = 0

    for (const location of locations) {
      for (const cat of PRIORITY_CATS) {
        step++
        setProgress(`${location} → ${cat} (${step}/${totalSteps})`)
        try {
          const leads = await searchAndEnrich({ ...form, location, category: cat })
          if (leads.length) {
            const { added } = await upsertLeads(leads)
            totalAdded += added
            allLeads.push(...leads)
            for (const lead of leads) {
              const slug = toSlug(lead.name)
              try {
                await createLeadFolder(slug)
                if (lead.photoRefs?.length) await downloadLeadPhotos(slug, lead.photoRefs)
              } catch {}
            }
          }
        } catch {}
      }
    }

    setResults({ leads: allLeads, added: totalAdded })
    toast(`✓ Done! ${locations.length} locations × ${PRIORITY_CATS.length} categories — ${allLeads.length} leads, ${totalAdded} new`)
    setLoading(false); setProgress('')
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      <PageHeader title="Lead Search">
        <Btn onClick={() => exportCsv()} disabled={!results?.leads?.length}>Export CSV</Btn>
        {batchMode ? (
          <Btn variant="primary" onClick={runBatch} disabled={loading}>
            {loading ? <><Spinner size={12}/> {progress}</> : '🌙 Run Batch Search'}
          </Btn>
        ) : (
          <>
            <Btn onClick={runAll} disabled={loading}>
              {loading && progress.includes('/') ? <><Spinner size={12}/> {progress}</> : '🔍 Search All Categories'}
            </Btn>
            <Btn variant="primary" onClick={run} disabled={loading}>
              {loading && !progress.includes('/') ? <><Spinner size={12}/> {progress || 'Searching...'}</> : 'Run Search →'}
            </Btn>
          </>
        )}
      </PageHeader>

      <div style={{ flex:1, overflowY:'auto', padding:'1.25rem' }}>
        <Card style={{ marginBottom:'1.25rem' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
            <div style={{ fontWeight:500, fontSize:13 }}>Search Parameters</div>
            <button onClick={() => setBatchMode(b => !b)} style={{
              fontSize:11, padding:'4px 10px', borderRadius:20, cursor:'pointer',
              background: batchMode ? 'var(--accent)' : 'var(--surface2)',
              color: batchMode ? '#fff' : 'var(--text2)',
              border:'1px solid var(--border2)', fontWeight:500
            }}>{batchMode ? '🌙 Batch Mode ON' : 'Batch Mode'}</button>
          </div>

          {batchMode ? (
            <>
              <Field label="Locations (one per line)" style={{ marginBottom:'1rem' }}>
                <textarea value={batchLocations} onChange={e => setBatchLocations(e.target.value)}
                  placeholder={'Kolonaki, Athens\nGlyfada, Athens\nKifisia, Athens\nThessaloniki\nHeraklion, Crete'}
                  style={{ minHeight:120, resize:'vertical', fontSize:13, lineHeight:1.7 }} />
              </Field>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'1rem', marginBottom:'1rem' }}>
                <Field label="Min Rating">
                  <select value={form.minRating} onChange={e=>set('minRating',parseFloat(e.target.value))}>
                    <option value={3.5}>3.5+ stars</option>
                    <option value={4.0}>4.0+ stars</option>
                    <option value={4.2}>4.2+ stars</option>
                    <option value={4.5}>4.5+ stars</option>
                  </select>
                </Field>
                <Field label="Min Reviews">
                  <input type="number" value={form.minReviews} onChange={e=>set('minReviews',+e.target.value)} min={0}/>
                </Field>
              </div>
              <div style={{ fontSize:11, color:'var(--text3)', lineHeight:1.6 }}>
                Searches <b>{PRIORITY_CATS.length} categories</b> across all locations. {batchLocations.split('\n').filter(l=>l.trim()).length || 0} locations entered = {(batchLocations.split('\n').filter(l=>l.trim()).length || 0) * PRIORITY_CATS.length} total searches.
              </div>
            </>
          ) : (
            <>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem', marginBottom:'1rem' }}>
                <Field label="Location / City">
                  <div style={{ display:'flex', gap:6 }}>
                    <input value={form.location} onChange={e=>set('location',e.target.value)}
                      placeholder="Athens, Thessaloniki, Heraklion..." onKeyDown={e=>e.key==='Enter'&&run()} />
                    <button onClick={()=>setShowMap(true)} title="Pick on map" style={{
                      flexShrink:0, padding:'7px 10px', background:'var(--surface2)',
                      border:'1px solid var(--border2)', borderRadius:'var(--r)',
                      cursor:'pointer', fontSize:16, lineHeight:1
                    }}>🗺️</button>
                  </div>
                </Field>
                <Field label="Business Category">
                  <select value={form.category} onChange={e=>set('category',e.target.value)}>
                    {CATS.map(c=><option key={c}>{c}</option>)}
                  </select>
                </Field>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'1rem' }}>
                <Field label="Min Rating">
                  <select value={form.minRating} onChange={e=>set('minRating',parseFloat(e.target.value))}>
                    <option value={3.5}>3.5+ stars</option>
                    <option value={4.0}>4.0+ stars</option>
                    <option value={4.2}>4.2+ stars</option>
                    <option value={4.5}>4.5+ stars</option>
                  </select>
                </Field>
                <Field label="Min Reviews">
                  <input type="number" value={form.minReviews} onChange={e=>set('minReviews',+e.target.value)} min={0}/>
                </Field>
              </div>
              <div style={{ marginTop:'0.75rem', fontSize:11, color:'var(--text3)', lineHeight:1.6 }}>
                Filters out businesses that <b>already have a website</b>. Only shows businesses with no website detected.
              </div>
            </>
          )}
        </Card>

        {loading && (
          <Card style={{ textAlign:'center', padding:'3rem' }}>
            <div style={{ marginBottom:'1rem' }}><Spinner size={28}/></div>
            <div style={{ fontWeight:500, color:'var(--text2)' }}>{progress}</div>
            <div style={{ fontSize:12, color:'var(--text3)', marginTop:4 }}>
              Fetching up to {form.maxResults} leads — may take 15–40 seconds
            </div>
          </Card>
        )}

        {results && !loading && (
          <>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:'1.25rem' }}>
              <Stat label="Found" value={results.leads.length} />
              <Stat label="New leads added" value={results.added} />
              <Stat label="Have phone" value={results.leads.filter(l=>l.phone).length} />
              <Stat label="Email found" value={results.leads.filter(l=>l.email).length} />
            </div>

            {results.leads.length === 0
              ? <Card style={{ textAlign:'center', padding:'2.5rem', color:'var(--text2)' }}>
                  No businesses matched. Try lowering min reviews/rating or changing category.
                </Card>
              : <Card p="0" style={{ overflow:'hidden' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                    <thead>
                      <tr style={{ borderBottom:'1px solid var(--border)' }}>
                        {['Business','Rating','Contact','Status',''].map(h =>
                          <th key={h} style={{ padding:'9px 14px', textAlign:'left', fontSize:11, fontWeight:500, color:'var(--text2)' }}>{h}</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {results.leads.map(lead => (
                        <tr key={lead.id} style={{ borderBottom:'1px solid var(--border)', cursor:'pointer' }}
                          onMouseEnter={e=>e.currentTarget.style.background='var(--surface2)'}
                          onMouseLeave={e=>e.currentTarget.style.background=''}>
                          <td style={{ padding:'10px 14px' }} onClick={()=>setDrawer(lead)}>
                            <div style={{ fontWeight:500 }}>{lead.name}</div>
                            <div style={{ fontSize:11, color:'var(--text3)' }}>{lead.neighborhood}</div>
                          </td>
                          <td style={{ padding:'10px 14px' }} onClick={()=>setDrawer(lead)}>
                            <Stars r={lead.rating}/>
                            <span style={{ fontSize:11, color:'var(--text3)', marginLeft:4 }}>({lead.reviewCount})</span>
                          </td>
                          <td style={{ padding:'10px 14px' }}>
                            {lead.email
                              ? <Badge color="green">📧 {lead.email}</Badge>
                              : lead.phone
                                ? <Badge color="amber">📞 Phone only</Badge>
                                : <Badge color="red">No contact</Badge>
                            }
                          </td>
                          <td style={{ padding:'10px 14px' }} onClick={()=>setDrawer(lead)}>
                            <StageBadge stage={lead.stage}/>
                          </td>
                          <td style={{ padding:'10px 14px' }}>
                            <button onClick={()=>setDrawer(lead)} style={{ fontSize:12, color:'var(--blue)',
                              background:'none', border:'none', cursor:'pointer', textDecoration:'underline' }}>
                              View →
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
            }
          </>
        )}

        {!results && !loading && (
          <Card style={{ textAlign:'center', padding:'3rem', color:'var(--text2)' }}>
            <div style={{ fontSize:32, marginBottom:'1rem' }}>🗺️</div>
            <div style={{ fontWeight:500, marginBottom:4 }}>Enter a location and category above</div>
            <div style={{ fontSize:12, color:'var(--text3)' }}>
              LeadsForger will find businesses matching your filters that don't have a website
            </div>
          </Card>
        )}
      </div>

      {showMap && (
        <MapPicker
          onSelect={(location) => set('location', location)}
          onClose={() => setShowMap(false)}
        />
      )}

      {drawer && (
        <LeadDrawer lead={drawer} toast={toast}
          onClose={()=>setDrawer(null)}
          onUpdate={updated=>{
            setDrawer(updated)
            setResults(r=>r ? {...r, leads: r.leads.map(l=>l.id===updated.id?updated:l)} : r)
          }}
        />
      )}
    </div>
  )
}
