import { useState, useEffect, useRef } from 'react'
import { fillTemplate, SOCIAL_META, toSlug } from '../lib/store'
import { generateBrief } from '../lib/brief'
import { updateLead, getTemplates, sendEmail, queueEmail, captureScreenshot, enrichSocial, analyzePhotos, refreshLeadPhotos, getLeadImages, getAssetManifest, filterManifestForCategory } from '../lib/api'
import { Btn, Stars, StageBadge, ContactBadge, Spinner, Badge } from './ui'
import DomainsTab from './DomainsTab'

const STAGES = ['new','emailed','in_progress','site_built','closed']

export default function LeadDrawer({ lead: init, onClose, onUpdate, toast }) {
  const [lead, setLead] = useState(init)
  const [tab, setTab] = useState('info')
  const [notes, setNotes] = useState(init.notes || '')
  // Contacts tab
  const [enrichingAI, setEnrichingAI] = useState(false)
  // Brief tab
  const [brief, setBrief] = useState('')
  const [copied, setCopied] = useState(false)
  const [visionAnalysis, setVisionAnalysis] = useState(init.visionAnalysis || '')
  const [analyzingPhotos, setAnalyzingPhotos] = useState(false)
  const [fetchingPhotos, setFetchingPhotos] = useState(false)
  const [photoLightbox, setPhotoLightbox] = useState(null)
  const photoUploadRef = useRef()
  const [folderPhotos, setFolderPhotos] = useState([])
  const [commonAssets, setCommonAssets] = useState([])
  // Email tab
  const [tplKey, setTplKey] = useState('cold')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [demoLink, setDemoLink] = useState(init.demoUrl || '')
  const [sending, setSending] = useState(false)
  // Screenshot tab
  const [siteUrl, setSiteUrl] = useState(init.demoUrl || '')
  const [capturing, setCapturing] = useState(false)
  const [capturingVideo, setCapturingVideo] = useState(false)
  const [videoProgress, setVideoProgress] = useState('')

  useEffect(() => {
    setLead(init); setNotes(init.notes || '')
    setSiteUrl(init.demoUrl || ''); setDemoLink(init.demoUrl || '')
    setVisionAnalysis(init.visionAnalysis || '')
  }, [init])

  // Auto-save notes when switching tabs or unmounting
  const notesRef = useRef(notes)
  const initNotesRef = useRef(init.notes || '')
  notesRef.current = notes
  useEffect(() => { initNotesRef.current = init.notes || '' }, [init])
  useEffect(() => {
    return () => {
      if (notesRef.current !== initNotesRef.current) {
        updateLead(lead.id, { notes: notesRef.current }).catch(() => {})
      }
    }
  }, [tab])

  useEffect(() => {
    if (tab === 'email') refreshEmail()
    if (tab === 'brief') loadFolderPhotos()
  }, [tab, tplKey, lead, demoLink])

  // Auto-load folder photos when drawer opens
  useEffect(() => {
    loadFolderPhotos()
  }, [lead.id])

  function loadFolderPhotos() {
    const slug = lead.slug || toSlug(lead.name)
    if (slug) getLeadImages(slug, 'photos').then(d => setFolderPhotos(d.files || [])).catch(() => setFolderPhotos([]))
    getAssetManifest().then(m => setCommonAssets(filterManifestForCategory(m, lead.category))).catch(() => setCommonAssets([]))
  }

  function refreshEmail() {
    // getTemplates is now async — load templates for email tab
    getTemplates().then(templates => {
      const tpl = templates[tplKey]
      if (!tpl) return
      setSubject(fillTemplate(tpl.subject, lead, { demoLink }))
      setBody(fillTemplate(tpl.body, lead, { demoLink }))
    }).catch(() => {})
  }

  async function save(fields) {
    const updated = await updateLead(lead.id, fields)
    setLead(updated); onUpdate?.(updated)
  }

  // ── Hunter email find ──
  // ── AI social enrichment (Perplexity) ──
  async function doAIEnrich() {
    setEnrichingAI(true)
    toast('Searching the web for contacts & social media...')
    try {
      const result = await enrichSocial(lead)
      if (!result?.found) { toast('Nothing found online for this business', 'error'); return }
      const fields = result.data || {}
      // Merge into lead — don't overwrite existing email if already found
      const updates = {
        instagram:   fields.instagram   || lead.instagram   || null,
        facebook:    fields.facebook    || lead.facebook    || null,
        tiktok:      fields.tiktok      || lead.tiktok      || null,
        tripadvisor: fields.tripadvisor || lead.tripadvisor || null,
        efood:       fields.efood       || lead.efood       || null,
        wolt:        fields.wolt        || lead.wolt        || null,
        booking:     fields.booking     || lead.booking     || null,
        phone2:      fields.phone2      || lead.phone2      || null,
        // Save scrape report to notes
        notes: fields.notes || lead.notes || null,
        // Only update email if we don't have one yet
        ...(!lead.email && fields.email ? { email: fields.email, emailFound: true, emailSource: 'web_scrape' } : {}),
        // If they have a website after all, flag it
        ...(fields.website ? { websiteFound: fields.website } : {})
      }
      save(updates)
      setNotes(updates.notes || '')
      const found = Object.entries(updates).filter(([k,v]) => v && !['notes'].includes(k)).length

      // Show email hint if no direct email but directory listing found
      if (!fields.email && fields.emailHint) {
        toast(`📧 No direct email found, but check: ${fields.emailHint}`, 'info')
      } else {
        toast(`✓ Found ${found} contact fields`)
      }
    } catch (e) {
      toast(e.message, 'error')
    } finally { setEnrichingAI(false) }
  }

  async function doSend() {
    if (!lead.email) { toast('No email for this lead', 'error'); return }
    if (!confirm(`Send to ${lead.email}?`)) return
    setSending(true)
    try {
      await sendEmail({ to: lead.email, subject, body, attachments: (lead.screenshotFiles||[]).slice(0,2) })
      save({ stage:'emailed', lastEmailedAt: new Date().toISOString() })
      toast('✓ Email sent!')
    } catch (e) { toast(e.message, 'error') }
    finally { setSending(false) }
  }

  async function doCapture() {
    if (!siteUrl) { toast('Enter the site URL first', 'error'); return }
    setCapturing(true)
    try {
      const data = await captureScreenshot(siteUrl, lead.id)
      save({ screenshotFiles:[...(lead.screenshotFiles||[]), ...(data.files||[])], demoUrl: siteUrl })
      setDemoLink(siteUrl)
      toast(`✓ ${data.files?.length || 0} screenshots captured`)
    } catch (e) { toast(e.message, 'error') }
    finally { setCapturing(false) }
  }

  async function doVideo() {
    if (!siteUrl) { toast('Enter the site URL first', 'error'); return }
    setCapturingVideo(true)
    setVideoProgress('Starting browser...')
    try {
      const slug = lead.slug || toSlug(lead.name)
      const response = await fetch('/api/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: siteUrl, leadId: lead.id, slug })
      })
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let result = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          if (trimmed.startsWith('data: ')) {
            try {
              const msg = JSON.parse(trimmed.slice(6))
              if (msg.progress) setVideoProgress(msg.progress)
              if (msg.done) result = msg
            } catch {}
          }
        }
      }

      if (result?.files?.length) {
        save({ videoFiles: [...(lead.videoFiles || []), ...result.files], demoUrl: siteUrl })
        setDemoLink(siteUrl)
        toast(`✓ ${result.files.length} videos recorded (${result.pages} pages)`)
      } else if (result?.error) {
        toast(result.error, 'error')
      }
    } catch (e) { toast(e.message, 'error') }
    finally { setCapturingVideo(false); setVideoProgress('') }
  }

  const tabs = [
    { key:'info',     label:'Info'        },
    { key:'contacts', label:'Contacts'    },
    { key:'brief',    label:'Brief'       },
    { key:'email',    label:'Email'       },
    { key:'shots',    label:'Screenshots' },
    { key:'domains',  label:'Domains' },
  ]
  const [templates, setTemplatesState] = useState({})
  useEffect(() => {
    getTemplates().then(t => setTemplatesState(t)).catch(() => {})
  }, [])

  // All social fields that could be set
  const socialFields = Object.entries(SOCIAL_META).filter(([k]) => k !== 'phone')

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.18)', zIndex:40 }} />
      <div style={{ position:'fixed', right:0, top:0, bottom:0, width:520,
        background:'var(--surface)', borderLeft:'1px solid var(--border)',
        zIndex:50, display:'flex', flexDirection:'column', boxShadow:'-4px 0 24px rgba(0,0,0,0.08)' }}>

        {/* Header */}
        <div style={{ padding:'1.25rem', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10 }}>
            <div>
              <h2 style={{ fontSize:16, fontWeight:600, marginBottom:2 }}>{lead.name}</h2>
              <div style={{ fontSize:12, color:'var(--text2)' }}>{lead.category} · {lead.neighborhood}</div>
            </div>
            <button onClick={onClose} style={{ background:'none', border:'none', fontSize:18, color:'var(--text3)', cursor:'pointer' }}>✕</button>
          </div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            <Badge color="amber">★ {lead.rating} ({lead.reviewCount})</Badge>
            <Badge color="red">No website</Badge>
            <ContactBadge lead={lead}/>
            <StageBadge stage={lead.stage}/>
            {lead.instagram && <Badge color="blue">📸 Instagram</Badge>}
            {lead.efood    && <Badge color="amber">🍔 e-food</Badge>}
            {lead.wolt     && <Badge color="blue">🛵 Wolt</Badge>}
          </div>
        </div>

        {/* Stage row */}
        <div style={{ padding:'0.625rem 1.25rem', borderBottom:'1px solid var(--border)',
          display:'flex', gap:4, flexShrink:0, flexWrap:'wrap' }}>
          <span style={{ fontSize:11, color:'var(--text3)', alignSelf:'center', marginRight:2 }}>Stage:</span>
          {STAGES.map(s => (
            <button key={s} onClick={() => save({ stage:s })} style={{
              padding:'3px 10px', fontSize:11, borderRadius:20,
              border:'1px solid var(--border2)',
              background: lead.stage===s ? 'var(--accent)' : 'var(--surface)',
              color: lead.stage===s ? '#fff' : 'var(--text2)',
              cursor:'pointer', fontWeight: lead.stage===s ? 500 : 400
            }}>{s.replace('_',' ')}</button>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
          {tabs.map(t => {
            // Badge dot for Domains tab
            let dotColor = null
            if (t.key === 'domains' && lead.domainResults?.length) {
              dotColor = lead.domainResults.some(r => r.available === true)
                ? 'var(--green)'
                : 'var(--red)'
            }
            return (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                flex:1, padding:'8px 4px', fontSize:11.5, background:'none', border:'none',
                borderBottom: tab===t.key ? '2px solid var(--text)' : '2px solid transparent',
                color: tab===t.key ? 'var(--text)' : 'var(--text2)',
                fontWeight: tab===t.key ? 500 : 400, cursor:'pointer', marginBottom:-1,
                display:'flex', alignItems:'center', justifyContent:'center', gap:4
              }}>
                {t.label}
                {dotColor && <span style={{
                  width:6, height:6, borderRadius:'50%', background:dotColor, display:'inline-block'
                }} />}
              </button>
            )
          })}
        </div>

        {/* Tab body */}
        <div style={{ flex:1, overflowY:'auto', padding:'1.25rem' }}>

          {/* ── INFO ── */}
          {tab==='info' && (
            <div style={{ display:'flex', flexDirection:'column', gap:'1.25rem' }}>
              <Sec title="Basic Info">
                <Row k="Phone" v={lead.phone
                  ? <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                      <a href={`tel:${lead.phone}`} style={{ color:'var(--blue)' }}>{lead.phone}</a>
                      <a href={`https://wa.me/${lead.phone?.replace(/[^0-9]/g,'')}`}
                        target="_blank" rel="noreferrer"
                        style={{ fontSize:11, color:'var(--green)', background:'var(--green-bg)',
                          padding:'2px 8px', borderRadius:20, textDecoration:'none' }}>
                        WhatsApp →
                      </a>
                    </div>
                  : '—'} />
                <Row k="Address" v={lead.address} />
                <Row k="Google Maps" v={<a href={lead.googleMapsUrl} target="_blank" rel="noreferrer" style={{ color:'var(--blue)' }}>Open listing →</a>} />
                <Row k="Added" v={lead.createdAt ? new Date(lead.createdAt).toLocaleDateString('el-GR') : '—'} />
              </Sec>

              <Sec title="Top Reviews">
                {!(lead.topReviews?.length)
                  ? <div style={{ fontSize:12, color:'var(--text3)' }}>No reviews captured</div>
                  : lead.topReviews.map((r,i) => (
                    <div key={i} style={{ background:'var(--surface2)', borderRadius:'var(--r)',
                      padding:'10px 12px', marginBottom:8 }}>
                      <div style={{ fontSize:12, lineHeight:1.6 }}>"{(r.text||'').slice(0,180)}"</div>
                      <div style={{ fontSize:11, color:'var(--text3)', marginTop:4 }}>★{r.rating} — {r.author}, {r.time}</div>
                    </div>
                  ))
                }
              </Sec>

              <Sec title="Notes">
                <textarea value={notes} onChange={e=>setNotes(e.target.value)}
                  placeholder="Add notes about this lead..."
                  style={{ minHeight:80, resize:'vertical', fontSize:13 }}/>
                <div style={{ marginTop:6 }}><Btn sm onClick={()=>save({notes})}>Save notes</Btn></div>
              </Sec>
            </div>
          )}

          {/* ── CONTACTS ── */}
          {tab==='contacts' && (
            <div style={{ display:'flex', flexDirection:'column', gap:'1.25rem' }}>

              {/* AI enrichment card */}
              <div style={{ background:'var(--surface2)', borderRadius:'var(--rl)',
                padding:'1rem 1.25rem', border:'1px solid var(--border)' }}>
                <div style={{ fontWeight:500, fontSize:13, marginBottom:4 }}>
                  🤖 AI Contact Search
                </div>
                <div style={{ fontSize:12, color:'var(--text2)', lineHeight:1.6, marginBottom:'0.875rem' }}>
                  Uses AI + web search to find Instagram, Facebook, email, e-food, Wolt, TripAdvisor and more. Takes 5–15 seconds.
                </div>
                <Btn variant="primary" onClick={doAIEnrich} disabled={enrichingAI} style={{ width:'100%' }}>
                  {enrichingAI
                    ? <><Spinner size={13}/> Searching the web...</>
                    : '🔍 Find all contacts & social media'}
                </Btn>
                {lead.socialNotes && (
                  <div style={{ marginTop:'0.75rem', fontSize:12, color:'var(--text2)',
                    fontStyle:'italic', lineHeight:1.5 }}>
                    "{lead.socialNotes}"
                  </div>
                )}
              </div>

              {/* Email display */}
              {lead.email && (
                <Sec title="Email">
                  <Row k="Email" v={
                    <a href={`mailto:${lead.email}`} style={{ color:'var(--blue)' }}>{lead.email}</a>
                  } />
                </Sec>
              )}

              {/* All found contact fields */}
              <Sec title="Found Contact Info">
                {socialFields.every(([k]) => !lead[k] && k !== 'phone2')
                  ? <div style={{ fontSize:12, color:'var(--text3)', padding:'0.5rem 0' }}>
                      No social/platform contacts found yet — hit AI Search above.
                    </div>
                  : socialFields.map(([key, meta]) => {
                      const val = lead[key]
                      if (!val) return null
                      const isUrl = val.startsWith('http')
                      return (
                        <div key={key} style={{ display:'flex', justifyContent:'space-between',
                          alignItems:'center', padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                            <span style={{ fontSize:15 }}>{meta.icon}</span>
                            <span style={{ fontSize:12, color:'var(--text2)' }}>{meta.label}</span>
                          </div>
                          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                            {isUrl
                              ? <a href={val} target="_blank" rel="noreferrer"
                                  style={{ fontSize:12, color:'var(--blue)', maxWidth:220,
                                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                  {val.replace('https://','').replace('http://','')}
                                </a>
                              : <span style={{ fontSize:12 }}>{val}</span>
                            }
                            <button onClick={() => { navigator.clipboard.writeText(val); toast('Copied!') }}
                              style={{ fontSize:11, color:'var(--text3)', background:'none',
                                border:'none', cursor:'pointer' }}>copy</button>
                          </div>
                        </div>
                      )
                    })
                }
              </Sec>

              {/* WhatsApp quick action */}
              {lead.phone && (
                <Sec title="Quick Actions">
                  <a href={`https://wa.me/${lead.phone.replace(/[^0-9]/g,'')}?text=Hi%20${encodeURIComponent(lead.name)}%2C%20I%20wanted%20to%20reach%20out%20about%20creating%20a%20website%20for%20you.`}
                    target="_blank" rel="noreferrer" style={{ textDecoration:'none' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px',
                      background:'#25D366', borderRadius:'var(--r)', color:'white',
                      fontSize:13, fontWeight:500, cursor:'pointer' }}>
                      <span style={{ fontSize:18 }}>💬</span>
                      Open WhatsApp conversation →
                    </div>
                  </a>
                </Sec>
              )}

              {/* Manually edit any field */}
              <Sec title="Edit manually">
                <div style={{ display:'grid', gap:8 }}>
                  {[
                    ['email',       'Email'],
                    ['instagram',   'Instagram URL'],
                    ['facebook',    'Facebook URL'],
                    ['tiktok',      'TikTok URL'],
                    ['tripadvisor', 'TripAdvisor URL'],
                    ['efood',       'e-food URL'],
                    ['wolt',        'Wolt URL'],
                    ['booking',     'Booking.com URL'],
                    ['phone2',      'Second phone'],
                  ].map(([k, label]) => (
                    <div key={k} style={{ display:'flex', gap:8, alignItems:'center' }}>
                      <label style={{ fontSize:11, color:'var(--text2)', width:100, flexShrink:0 }}>{label}</label>
                      <input defaultValue={lead[k] || ''} key={lead[k]}
                        onBlur={e => { if (e.target.value !== (lead[k]||'')) save({ [k]: e.target.value || null }) }}
                        placeholder={`—`} style={{ fontSize:12 }} />
                    </div>
                  ))}
                </div>
              </Sec>
            </div>
          )}

          {/* ── BRIEF ── */}
          {tab==='brief' && (
            <div>
              <div style={{ fontSize:12, color:'var(--text2)', marginBottom:'1rem', lineHeight:1.6 }}>
                Copy → paste into Kiro chat → Kiro builds the site in your workspace.
              </div>

              {folderPhotos.length > 0 ? (
                <div style={{ marginBottom:'1rem', padding:'10px 12px', background:'var(--surface2)',
                  borderRadius:'var(--r)' }}>
                  <div style={{ display:'flex', gap:6, marginBottom:8, flexWrap:'wrap' }}>
                    {folderPhotos.map((file, i) => {
                      const slug = lead.slug || toSlug(lead.name)
                      return (
                        <div key={file} style={{ position:'relative', width:40, height:40 }}>
                          <img src={`/api/lead-images/${slug}/photos/${file}`}
                            alt={file} onClick={() => setPhotoLightbox({ type:'folder', file, slug })} style={{ width:40, height:40, objectFit:'cover', borderRadius:4,
                              border:'1px solid var(--border)', cursor:'pointer' }} />
                          <div style={{ position:'absolute', bottom:0, left:0, background:'rgba(0,0,0,0.6)',
                            color:'#fff', fontSize:7, padding:'0 3px', borderRadius:2 }}>{i+1}</div>
                        </div>
                      )
                    })}
                  </div>
                  <div style={{ fontSize:9, color:'var(--text3)', marginBottom:6 }}>
                    {folderPhotos.length} photos in folder · drop more into <code style={{ fontFamily:'var(--mono)', fontSize:8 }}>sites/{lead.slug || toSlug(lead.name)}/photos/</code>
                    {' · '}
                    <button onClick={loadFolderPhotos} style={{ fontSize:9, color:'var(--blue)', background:'none', border:'none', cursor:'pointer', padding:0 }}>↻ refresh</button>
                  </div>
                  <div style={{ display:'flex', gap:6, marginBottom:6 }}>
                    <Btn sm onClick={async () => {
                      setFetchingPhotos(true)
                      try {
                        const { photoRefs } = await refreshLeadPhotos(lead)
                        if (photoRefs.length) {
                          save({ photoRefs })
                          setVisionAnalysis(''); setBrief('')
                          toast(`✓ Re-fetched ${photoRefs.length} photos`)
                        } else { toast('No photos found', 'error') }
                      } catch (e) { toast(e.message, 'error') }
                      finally { setFetchingPhotos(false) }
                    }} disabled={fetchingPhotos} style={{ flex:1 }}>
                      {fetchingPhotos ? <><Spinner size={10}/> Fetching...</> : '🔄 Re-fetch'}
                    </Btn>
                  </div>
                  <Btn sm onClick={async () => {
                    setAnalyzingPhotos(true); setBrief('')
                    try {
                      const data = await analyzePhotos(lead)
                      setVisionAnalysis(data.analysis)
                      save({ visionAnalysis: data.analysis })
                      toast(`✓ Analyzed ${data.photoCount} photos`)
                    } catch (e) { toast(e.message, 'error') }
                    finally { setAnalyzingPhotos(false) }
                  }} disabled={analyzingPhotos || !folderPhotos.length} style={{ width:'100%' }}>
                    {(() => {
                      const total = folderPhotos.length
                      if (analyzingPhotos) return <><Spinner size={10}/> Analyzing {total} photos...</>
                      if (visionAnalysis) return `✓ Re-analyze (${total} photos)`
                      return `📸 Analyze ${total} photos first`
                    })()}
                  </Btn>
                </div>
              ) : (
                <div style={{ marginBottom:'1rem', padding:'10px 12px', background:'var(--surface2)',
                  borderRadius:'var(--r)', textAlign:'center' }}>
                  <div style={{ fontSize:12, color:'var(--text3)', marginBottom:8 }}>No photos stored yet</div>
                  <div style={{ display:'flex', gap:6 }}>
                    <Btn sm onClick={async () => {
                      setFetchingPhotos(true)
                      try {
                        const { photoRefs } = await refreshLeadPhotos(lead)
                        if (photoRefs.length) {
                          save({ photoRefs })
                          toast(`✓ Found ${photoRefs.length} photos`)
                        } else {
                          toast('No photos on Google Maps for this business', 'error')
                        }
                      } catch (e) { toast(e.message, 'error') }
                      finally { setFetchingPhotos(false) }
                    }} disabled={fetchingPhotos} style={{ flex:1 }}>
                      {fetchingPhotos ? <><Spinner size={10}/> Fetching...</> : '📸 Fetch from Google'}
                    </Btn>
                    <Btn sm onClick={() => photoUploadRef.current?.click()} style={{ flex:1 }}>
                      📁 Upload your own
                    </Btn>
                  </div>
                  <input ref={photoUploadRef} type="file" accept="image/*" multiple style={{ display:'none' }}
                    onChange={e => {
                      const files = Array.from(e.target.files || [])
                      if (!files.length) return
                      const existing = lead.customPhotos || []
                      let loaded = 0
                      files.forEach(file => {
                        if (file.size > 5 * 1024 * 1024) { toast(`${file.name} too large (max 5MB)`, 'error'); return }
                        const reader = new FileReader()
                        reader.onload = ev => {
                          existing.push(ev.target.result)
                          loaded++
                          if (loaded === files.length) {
                            save({ customPhotos: [...existing] })
                            setVisionAnalysis(''); setBrief('')
                            toast(`✓ Added ${files.length} photo${files.length > 1 ? 's' : ''}`)
                          }
                        }
                        reader.readAsDataURL(file)
                      })
                      e.target.value = ''
                    }} />
                </div>
              )}

              <pre style={{ background:'var(--surface2)', borderRadius:'var(--r)', padding:'1rem',
                fontSize:11.5, fontFamily:'var(--mono)', lineHeight:1.7, whiteSpace:'pre-wrap',
                wordBreak:'break-word', maxHeight:460, overflowY:'auto' }}>
                {brief || generateBrief(lead, { visionAnalysis: visionAnalysis || undefined, folderPhotos, commonAssets })}
              </pre>
              <div style={{ display:'flex', gap:8, marginTop:'1rem' }}>
                <Btn onClick={() => {
                  const text = brief || generateBrief(lead, { visionAnalysis: visionAnalysis || undefined, folderPhotos, commonAssets })
                  if (!brief) setBrief(text)
                  navigator.clipboard.writeText(text)
                  setCopied(true); setTimeout(()=>setCopied(false),1800)
                  toast('Brief copied!')
                }}>{copied ? '✓ Copied!' : 'Copy to clipboard'}</Btn>
                <Btn variant="primary" onClick={() => save({ stage:'in_progress' })}>
                  Mark In Progress
                </Btn>
              </div>
            </div>
          )}

          {/* ── EMAIL ── */}
          {tab==='email' && (
            <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
              {!lead.email && (
                <div style={{ padding:'8px 12px', background:'var(--amber-bg)', color:'var(--amber)',
                  borderRadius:'var(--r)', fontSize:12 }}>
                  ⚠️ No email — find it in the Contacts tab first.
                </div>
              )}
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {Object.entries(templates).map(([k,t]) => (
                  <button key={k} onClick={()=>setTplKey(k)} style={{
                    padding:'5px 12px', fontSize:12, borderRadius:20,
                    border:'1px solid var(--border2)',
                    background: tplKey===k ? 'var(--accent)' : 'var(--surface)',
                    color: tplKey===k ? '#fff' : 'var(--text2)', cursor:'pointer'
                  }}>{t.name}</button>
                ))}
              </div>
              <div>
                <label style={{ fontSize:11, color:'var(--text2)', display:'block', marginBottom:4 }}>Demo link</label>
                <input value={demoLink} onChange={e=>setDemoLink(e.target.value)} placeholder="https://yoursite.vercel.app"/>
              </div>
              <div>
                <label style={{ fontSize:11, color:'var(--text2)', display:'block', marginBottom:4 }}>To</label>
                <div style={{ fontSize:13, padding:'7px 10px', background:'var(--surface2)', borderRadius:'var(--r)' }}>
                  {lead.email || '— no email —'}
                </div>
              </div>
              <div>
                <label style={{ fontSize:11, color:'var(--text2)', display:'block', marginBottom:4 }}>Subject</label>
                <input value={subject} onChange={e=>setSubject(e.target.value)}/>
              </div>
              <div>
                <label style={{ fontSize:11, color:'var(--text2)', display:'block', marginBottom:4 }}>Body</label>
                <textarea value={body} onChange={e=>setBody(e.target.value)}
                  style={{ minHeight:240, resize:'vertical', fontSize:13, lineHeight:1.8 }}/>
              </div>
              {(lead.screenshotFiles||[]).length > 0 && (
                <div style={{ fontSize:12, color:'var(--text2)' }}>
                  📎 {lead.screenshotFiles.length} screenshot(s) will be attached
                </div>
              )}
              <div style={{ display:'flex', gap:8 }}>
                <Btn onClick={async () => {
                  if (!lead.email) { toast('No email', 'error'); return }
                  try {
                    await queueEmail({ to:lead.email, subject, body, leadId:lead.id, leadName:lead.name, attachments:(lead.screenshotFiles||[]).slice(0,2) })
                    toast(`✓ Queued email for ${lead.name}`)
                  } catch (e) { toast(e.message, 'error') }
                }} disabled={!lead.email}>📋 Add to queue</Btn>
                <Btn variant="primary" onClick={doSend} disabled={sending||!lead.email}>
                  {sending ? <><Spinner size={12}/> Sending...</> : `Send now`}
                </Btn>
              </div>
            </div>
          )}

          {/* ── SCREENSHOTS & VIDEO ── */}
          {tab==='shots' && (
            <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
              <div style={{ fontSize:12, color:'var(--text2)', lineHeight:1.6 }}>
                Run the site locally, paste the URL, capture screenshots or a full video walkthrough.
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <input value={siteUrl} onChange={e=>setSiteUrl(e.target.value)}
                  placeholder="http://localhost:3000" style={{ flex:1 }}/>
                <Btn onClick={doCapture} disabled={capturing}>
                  {capturing ? <><Spinner size={12}/> ...</> : '📸 Screenshots'}
                </Btn>
                <Btn variant="primary" onClick={doVideo} disabled={capturingVideo}>
                  {capturingVideo ? <><Spinner size={12}/> Recording...</> : '🎬 Video'}
                </Btn>
              </div>
              {capturingVideo && videoProgress && (
                <div style={{ padding:'8px 12px', background:'var(--surface2)', borderRadius:'var(--r)',
                  fontSize:12, color:'var(--text2)', display:'flex', alignItems:'center', gap:8 }}>
                  <Spinner size={14}/>
                  <span>{videoProgress}</span>
                </div>
              )}
              {/* Video files */}
              {(lead.videoFiles||[]).length > 0 && (
                <div>
                  <div style={{ fontSize:11, color:'var(--text3)', marginBottom:6 }}>Videos</div>
                  {lead.videoFiles.map((f,i) => (
                    <div key={i} style={{ marginBottom:8 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                        <div style={{ fontSize:11, color:'var(--text3)' }}>
                          {f.includes('desktop') ? '🖥️ Desktop walkthrough' : '📱 Mobile walkthrough'}
                        </div>
                        <Btn sm variant="danger" onClick={() => {
                          const updated = lead.videoFiles.filter((_, j) => j !== i)
                          save({ videoFiles: updated })
                        }}>✕</Btn>
                      </div>
                      <video src={lead.slug ? `/api/lead-images/${lead.slug}/${f}` : `/api/screenshots/${f}`}
                        controls style={{ width:'100%', borderRadius:'var(--r)', border:'1px solid var(--border)' }}/>
                    </div>
                  ))}
                </div>
              )}
              {/* Screenshot files */}
              {(lead.screenshotFiles||[]).length > 0
                ? lead.screenshotFiles.map((f,i) => (
                  <div key={i}>
                    <div style={{ fontSize:11, color:'var(--text3)', marginBottom:4 }}>
                      {['Desktop hero','Full page','Mobile'][i] || f}
                    </div>
                    <img src={`/api/screenshots/${f}`} alt=""
                      style={{ width:'100%', borderRadius:'var(--r)', border:'1px solid var(--border)' }}/>
                  </div>
                ))
                : !(lead.videoFiles||[]).length && <div style={{ border:'2px dashed var(--border2)', borderRadius:'var(--rl)',
                    padding:'2.5rem', textAlign:'center', color:'var(--text3)', fontSize:12 }}>
                    No captures yet
                  </div>
              }
            </div>
          )}

          {/* ── DOMAINS ── */}
          {tab==='domains' && (
            <DomainsTab lead={lead} onSave={save} toast={toast} />
          )}
        </div>
      </div>

      {/* Photo lightbox */}
      {photoLightbox !== null && lead && (() => {
        const slug = lead.slug || toSlug(lead.name)
        const allPhotos = folderPhotos.map(f => ({ src:`/api/lead-images/${slug}/photos/${f}`, name:f }))
        const idx = folderPhotos.indexOf(photoLightbox.file)
        if (idx < 0 || !allPhotos[idx]) return null
        const go = (n) => setPhotoLightbox({ type:'folder', file:folderPhotos[n], slug })
        return (
          <div onClick={() => setPhotoLightbox(null)} style={{
            position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:200,
            display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer'
          }}>
            {idx > 0 && (
              <button onClick={e => { e.stopPropagation(); go(idx - 1) }} style={{
                position:'absolute', left:16, top:'50%', transform:'translateY(-50%)',
                background:'rgba(255,255,255,0.15)', border:'none', color:'#fff',
                width:36, height:36, borderRadius:'50%', fontSize:18, cursor:'pointer',
                display:'flex', alignItems:'center', justifyContent:'center'
              }}>‹</button>
            )}
            <div onClick={e => e.stopPropagation()} style={{ maxWidth:'85vw', maxHeight:'80vh' }}>
              <img src={allPhotos[idx].src} alt={allPhotos[idx].name} style={{
                maxWidth:'85vw', maxHeight:'80vh', objectFit:'contain', borderRadius:8
              }} />
              <div style={{ textAlign:'center', color:'rgba(255,255,255,0.7)', fontSize:12, marginTop:8 }}>
                {allPhotos[idx].name} — {idx + 1} of {allPhotos.length}
              </div>
            </div>
            {idx < allPhotos.length - 1 && (
              <button onClick={e => { e.stopPropagation(); go(idx + 1) }} style={{
                position:'absolute', right:16, top:'50%', transform:'translateY(-50%)',
                background:'rgba(255,255,255,0.15)', border:'none', color:'#fff',
                width:36, height:36, borderRadius:'50%', fontSize:18, cursor:'pointer',
                display:'flex', alignItems:'center', justifyContent:'center'
              }}>›</button>
            )}
            <button onClick={() => setPhotoLightbox(null)} style={{
              position:'absolute', top:16, right:16, background:'none', border:'none',
              color:'#fff', fontSize:22, cursor:'pointer'
            }}>✕</button>
          </div>
        )
      })()}
    </>
  )
}

function Sec({ title, children }) {
  return <div>
    <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text3)',
      marginBottom:'0.6rem', borderBottom:'1px solid var(--border)', paddingBottom:'0.4rem' }}>{title}</div>
    {children}
  </div>
}

function Row({ k, v }) {
  return <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start',
    padding:'6px 0', borderBottom:'1px solid var(--border)', gap:'1rem' }}>
    <span style={{ fontSize:12, color:'var(--text2)', flexShrink:0 }}>{k}</span>
    <span style={{ fontSize:13, fontWeight:500, textAlign:'right', wordBreak:'break-all' }}>{v||'—'}</span>
  </div>
}
