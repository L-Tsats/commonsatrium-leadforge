import { useState, useRef, useEffect } from 'react'
import { buildAssetsBlock, toSlug } from '../lib/store'
import { generateBrief } from '../lib/brief'
import { getLeads, updateLead, getAssets, addAsset, analyzePhotos, refreshLeadPhotos, getLeadImages, downloadLeadPhotos, saveBrief, getAssetManifest, filterManifestForCategory } from '../lib/api'
import { Btn, Card, PageHeader, Badge, Spinner } from '../components/ui'

const TYPE_META = {
  snippet: { label: 'Snippet',  icon: '{ }', color: 'blue'  },
  palette: { label: 'Palette',  icon: '🎨',  color: 'amber' },
  image:   { label: 'Image',    icon: '🖼️',  color: 'green' },
  url:     { label: 'Reference',icon: '🔗',  color: 'gray'  },
}

export default function BriefPage({ toast, onNavigate }) {
  const [sel, setSel] = useState('')
  const [brief, setBrief] = useState('')
  const [copied, setCopied] = useState(false)
  const [selectedAssets, setSelectedAssets] = useState([])
  const [visionAnalysis, setVisionAnalysis] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [fetchingPhotos, setFetchingPhotos] = useState(false)
  const [scaffolding, setScaffolding] = useState(false)
  const [saved, setSaved] = useState(false)
  const [folderPhotos, setFolderPhotos] = useState([])
  const [folderAssets, setFolderAssets] = useState([])
  const [commonAssets, setCommonAssets] = useState([])
  const [personalNotes, setPersonalNotes] = useState('')
  const [customColors, setCustomColors] = useState([])
  const [colorInput, setColorInput] = useState('#000000')
  const [refreshKey, setRefreshKey] = useState(0)
  const [lightbox, setLightbox] = useState(null) // index of photo to show full-size
  const [leadSearch, setLeadSearch] = useState('')
  const uploadRef = useRef()
  const [leads, setLeads] = useState([])
  const [assets, setAssets] = useState([])
  const lead = leads.find(l => l.id === sel)

  // Load leads and assets on mount
  useEffect(() => {
    getLeads().then(l => setLeads(l)).catch(() => {})
    getAssets().then(a => setAssets(a)).catch(() => {})
  }, [])

  function generate() {
    if (!lead) return
    const base = generateBrief(lead, { visionAnalysis: visionAnalysis || undefined, folderPhotos, commonAssets, personalNotes: personalNotes.trim() || undefined, customColors: customColors.length ? customColors : undefined })
    const assetsBlock = buildAssetsBlock(selectedAssets)
    setBrief(base + assetsBlock)
    setSaved(false)
  }

  async function handleSaveBrief() {
    if (!brief || !lead) return
    setScaffolding(true)
    try {
      const slug = lead.slug || toSlug(lead.name)
      await saveBrief(slug, brief)
      navigator.clipboard.writeText(brief)
      setSaved(true)
      toast(`✓ Brief saved to sites/${slug}/BRIEF.md — copied to clipboard`)
    } catch (e) { toast(e.message, 'error') }
    finally { setScaffolding(false) }
  }

  // Load folder images when lead changes
  async function loadFolderImages(slug) {
    try {
      const [photos, assets] = await Promise.all([
        getLeadImages(slug, 'photos'),
        getLeadImages(slug, 'assets')
      ])
      setFolderPhotos(photos.files || [])
      setFolderAssets(assets.files || [])
    } catch { setFolderPhotos([]); setFolderAssets([]) }
  }

  function copy() {
    if (!brief) return
    navigator.clipboard.writeText(brief)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
    toast('Brief copied to clipboard')
  }

  function toggleAsset(id) {
    setSelectedAssets(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
    setBrief('')
  }

  function selectAll() { setSelectedAssets(assets.map(a => a.id)); setBrief('') }
  function clearAll()  { setSelectedAssets([]); setBrief('') }

  const grouped = Object.fromEntries(
    Object.keys(TYPE_META).map(t => [t, assets.filter(a => a.type === t)])
  )

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      <PageHeader title="Kiro Brief">
        <Btn onClick={copy} disabled={!brief}>{copied ? '✓ Copied!' : 'Copy brief'}</Btn>
        <Btn onClick={handleSaveBrief} disabled={!brief || scaffolding}>
          {scaffolding ? <><Spinner size={12}/> Saving...</> : saved ? '✓ Brief saved' : '💾 Save brief to folder'}
        </Btn>
        <Btn variant="primary" onClick={generate} disabled={!sel}>Generate →</Btn>
      </PageHeader>

      <div style={{ flex:1, overflowY:'auto', padding:'1.25rem',
        display:'grid', gridTemplateColumns:'300px 1fr', gap:'1.25rem', alignItems:'start' }}>

        <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
          <Card>
            <div style={{ fontSize:11, color:'var(--text2)', marginBottom:'0.75rem', fontWeight:500 }}>1. Select a lead</div>
            <input value={leadSearch} onChange={e => setLeadSearch(e.target.value)}
              placeholder="Search leads..." style={{ marginBottom:6, fontSize:12 }} />
            <select value={sel} onChange={e => {
              const id = e.target.value
              setSel(id); setBrief(''); setSaved(false)
              const l = leads.find(x => x.id === id)
              setVisionAnalysis(l?.visionAnalysis || '')
              if (l) loadFolderImages(l.slug || toSlug(l.name))
              else { setFolderPhotos([]); setFolderAssets([]) }
              if (l) getAssetManifest().then(m => setCommonAssets(filterManifestForCategory(m, l.category))).catch(() => setCommonAssets([]))
              else setCommonAssets([])
            }}
              style={{ marginBottom: lead ? '1rem' : 0 }}>
              <option value="">— choose —</option>
              {leads
                .filter(l => !leadSearch || l.name?.toLowerCase().includes(leadSearch.toLowerCase()) || l.category?.toLowerCase().includes(leadSearch.toLowerCase()) || l.neighborhood?.toLowerCase().includes(leadSearch.toLowerCase()))
                .map(l => <option key={l.id} value={l.id}>{l.name} ({l.neighborhood})</option>)}
            </select>
            </select>
            {lead && (
              <div style={{ fontSize:12, color:'var(--text2)', lineHeight:1.7,
                borderTop:'1px solid var(--border)', paddingTop:'0.75rem' }}>
                <div style={{ fontWeight:500, color:'var(--text)', marginBottom:4 }}>{lead.name}</div>
                <div>★ {lead.rating} · {lead.reviewCount} reviews</div>
                <div style={{ color:'var(--text3)' }}>{lead.category} · {lead.neighborhood}</div>
                {lead.phone && <div>📞 {lead.phone}</div>}
                {lead.email && <div>📧 {lead.email}</div>}
                <div style={{ marginTop:6, fontSize:11, color:'var(--text3)', fontFamily:'var(--mono)' }}>
                  📁 sites/{lead.slug || toSlug(lead.name)}/
                </div>
                {(folderPhotos.length > 0 || folderAssets.length > 0) && (
                  <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>
                    {folderPhotos.length > 0 && <span>{folderPhotos.length} photos</span>}
                    {folderPhotos.length > 0 && folderAssets.length > 0 && <span> · </span>}
                    {folderAssets.length > 0 && <span>{folderAssets.length} assets</span>}
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.75rem' }}>
              <div style={{ fontSize:11, color:'var(--text2)', fontWeight:500 }}>2. Analyze photos</div>
              <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                {lead && folderPhotos.length > 0 && (
                  <Badge color="gray">{folderPhotos.length}</Badge>
                )}
                {lead && <button onClick={() => loadFolderImages(lead.slug || toSlug(lead.name))} style={{
                  fontSize:11, color:'var(--blue)', background:'none', border:'none', cursor:'pointer'
                }}>↻ refresh</button>}
              </div>
            </div>

            {!lead ? (
              <div style={{ fontSize:12, color:'var(--text3)', padding:'0.5rem 0' }}>Select a lead first</div>
            ) : !folderPhotos.length ? (
              <div style={{ textAlign:'center', padding:'1rem 0' }}>
                <div style={{ fontSize:12, color:'var(--text3)', lineHeight:1.6, marginBottom:'0.75rem' }}>
                  No photos in folder yet. Drop images into<br/>
                  <code style={{ fontFamily:'var(--mono)', fontSize:11 }}>sites/{lead.slug || toSlug(lead.name)}/photos/</code><br/>
                  and hit refresh, or fetch from Google.
                </div>
                <Btn onClick={async () => {
                  setFetchingPhotos(true)
                  try {
                    const slug = lead.slug || toSlug(lead.name)
                    const { photoRefs } = await refreshLeadPhotos(lead)
                    if (photoRefs.length) {
                      await downloadLeadPhotos(slug, photoRefs)
                      await updateLead(lead.id, { photoRefs })
                      loadFolderImages(slug)
                      toast(`✓ Downloaded ${photoRefs.length} Google photos to folder`)
                    } else {
                      toast('No photos available on Google Maps', 'error')
                    }
                  } catch (e) { toast(e.message, 'error') }
                  finally { setFetchingPhotos(false) }
                }} disabled={fetchingPhotos} style={{ width:'100%' }}>
                  {fetchingPhotos ? <><Spinner size={12}/> Fetching...</> : '📸 Fetch Google photos into folder'}
                </Btn>
              </div>
            ) : (
              <>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:'0.75rem' }}>
                  {folderPhotos.map((file, i) => {
                    const slug = lead.slug || toSlug(lead.name)
                    return (
                      <div key={file} style={{ position:'relative', width:52, height:52 }}>
                        <img src={`/api/lead-images/${slug}/photos/${file}`}
                          alt={file} onClick={() => setLightbox({ type:'folder', file, slug })} style={{
                            width:52, height:52, objectFit:'cover', borderRadius:'var(--r)',
                            border:'1px solid var(--border)', cursor:'pointer'
                          }} />
                        <div style={{ position:'absolute', bottom:1, left:1, background:'rgba(0,0,0,0.6)',
                          color:'#fff', fontSize:8, padding:'1px 4px', borderRadius:3 }}>{i+1}</div>
                      </div>
                    )
                  })}
                </div>
                <div style={{ fontSize:10, color:'var(--text3)', marginBottom:'0.5rem' }}>
                  {folderPhotos.length} photos in <code style={{ fontFamily:'var(--mono)', fontSize:9 }}>sites/{lead.slug || toSlug(lead.name)}/photos/</code>
                  {' · drop more & hit '}
                  <button onClick={() => loadFolderImages(lead.slug || toSlug(lead.name))} style={{
                    fontSize:10, color:'var(--blue)', background:'none', border:'none', cursor:'pointer', padding:0
                  }}>↻ refresh</button>
                </div>
                <div style={{ display:'flex', gap:6, marginBottom:'0.5rem' }}>
                  <Btn sm onClick={async () => {
                    setFetchingPhotos(true)
                    try {
                      const { photoRefs } = await refreshLeadPhotos(lead)
                      if (photoRefs.length) {
                        await updateLead(lead.id, { photoRefs })
                        setRefreshKey(k => k + 1)
                        setVisionAnalysis(''); setBrief('')
                        toast(`✓ Re-fetched ${photoRefs.length} photos`)
                      } else { toast('No photos found', 'error') }
                    } catch (e) { toast(e.message, 'error') }
                    finally { setFetchingPhotos(false) }
                  }} disabled={fetchingPhotos} style={{ flex:1 }}>
                    {fetchingPhotos ? <><Spinner size={10}/> Fetching...</> : '🔄 Re-fetch'}
                  </Btn>
                </div>
                <Btn onClick={async () => {
                  setAnalyzing(true); setBrief('')
                  try {
                    const data = await analyzePhotos(lead)
                    setVisionAnalysis(data.analysis)
                    await updateLead(lead.id, { visionAnalysis: data.analysis })
                    // Auto-save extracted assets to the library
                    if (data.assets) {
                      let count = 0
                      if (data.assets.palette) {
                        await addAsset({ type:'palette', name:data.assets.palette.name, content:data.assets.palette.content })
                        count++
                      }
                      if (data.assets.fonts) {
                        await addAsset({ type:'palette', name:data.assets.fonts.name, content:data.assets.fonts.content })
                        count++
                      }
                      if (data.assets.logo) {
                        await addAsset({ type:'snippet', name:data.assets.logo.name, content:data.assets.logo.content })
                        count++
                      }
                      if (data.assets.hero) {
                        await addAsset({ type:'snippet', name:data.assets.hero.name, content:data.assets.hero.content })
                        count++
                      }
                      if (count) toast(`✓ Analyzed ${data.photoCount} photos · ${count} assets saved to library`)
                      else toast(`✓ Analyzed ${data.photoCount} photos`)
                    } else {
                      toast(`✓ Analyzed ${data.photoCount} photos`)
                    }
                  } catch (e) { toast(e.message, 'error') }
                  finally { setAnalyzing(false) }
                }} disabled={analyzing || !folderPhotos.length} style={{ width:'100%' }}>
                  {analyzing
                    ? <><Spinner size={12}/> Analyzing {folderPhotos.length} photos...</>
                    : visionAnalysis
                      ? `✓ Re-analyze (${folderPhotos.length} photos)`
                      : `📸 Analyze ${folderPhotos.length} photos for design direction`}
                </Btn>
                {visionAnalysis && (
                  <div style={{ marginTop:'0.75rem', fontSize:11, color:'var(--text2)', lineHeight:1.6,
                    background:'var(--surface2)', padding:'8px 10px', borderRadius:'var(--r)',
                    maxHeight:160, overflowY:'auto' }}>
                    {visionAnalysis.slice(0, 500)}{visionAnalysis.length > 500 ? '...' : ''}
                  </div>
                )}
              </>
            )}
          </Card>

          {/* Shared file input for photo uploads */}
          {lead && (
            <input ref={uploadRef} type="file" accept="image/*" multiple style={{ display:'none' }}
              onChange={e => {
                const files = Array.from(e.target.files || [])
                if (!files.length) return
                const existing = lead.customPhotos || []
                let loaded = 0
                files.forEach(file => {
                  if (file.size > 5 * 1024 * 1024) { toast(`${file.name} too large (max 5MB)`, 'error'); return }
                  const reader = new FileReader()
                  reader.onload = async (ev) => {
                    existing.push(ev.target.result)
                    loaded++
                    if (loaded === files.length) {
                      await updateLead(lead.id, { customPhotos: [...existing] })
                      setRefreshKey(k => k + 1)
                      setVisionAnalysis(''); setBrief('')
                      toast(`✓ Added ${files.length} photo${files.length > 1 ? 's' : ''}`)
                    }
                  }
                  reader.readAsDataURL(file)
                })
                e.target.value = ''
              }} />
          )}

          <Card>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.75rem' }}>
              <div style={{ fontSize:11, color:'var(--text2)', fontWeight:500 }}>3. Pick assets to include</div>
              {assets.length > 0 && (
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={selectAll} style={{ fontSize:11, color:'var(--blue)', background:'none', border:'none', cursor:'pointer' }}>All</button>
                  <button onClick={clearAll}  style={{ fontSize:11, color:'var(--text3)', background:'none', border:'none', cursor:'pointer' }}>None</button>
                </div>
              )}
            </div>

            {assets.length === 0 ? (
              <div style={{ textAlign:'center', padding:'1.5rem 0' }}>
                <div style={{ fontSize:20, marginBottom:6 }}>📦</div>
                <div style={{ fontSize:12, color:'var(--text3)', lineHeight:1.6 }}>No assets yet.</div>
                <button onClick={() => onNavigate('assets')} style={{
                  marginTop:8, fontSize:12, color:'var(--blue)',
                  background:'none', border:'none', cursor:'pointer'
                }}>Go to Assets Library →</button>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:'0.875rem' }}>
                {Object.entries(grouped).map(([type, items]) => {
                  if (!items.length) return null
                  const m = TYPE_META[type]
                  return (
                    <div key={type}>
                      <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'0.07em',
                        color:'var(--text3)', marginBottom:'0.4rem' }}>
                        {m.icon} {m.label}s
                      </div>
                      {items.map(asset => (
                        <label key={asset.id} style={{
                          display:'flex', alignItems:'center', gap:8, padding:'6px 8px',
                          borderRadius:'var(--r)', cursor:'pointer',
                          background: selectedAssets.includes(asset.id) ? 'var(--surface2)' : 'transparent',
                          transition:'background 0.1s'
                        }}>
                          <input type="checkbox"
                            checked={selectedAssets.includes(asset.id)}
                            onChange={() => toggleAsset(asset.id)}
                            style={{ width:14, height:14, cursor:'pointer', accentColor:'var(--accent)' }}
                          />
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:12, fontWeight: selectedAssets.includes(asset.id) ? 500 : 400,
                              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                              {asset.name}
                            </div>
                            {asset.type === 'url' && (
                              <div style={{ fontSize:10, color:'var(--text3)', overflow:'hidden',
                                textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{asset.url}</div>
                            )}
                          </div>
                          <Badge color={m.color}>{m.label}</Badge>
                        </label>
                      ))}
                    </div>
                  )
                })}
                {selectedAssets.length > 0 && (
                  <div style={{ fontSize:11, color:'var(--blue)', borderTop:'1px solid var(--border)', paddingTop:'0.5rem' }}>
                    {selectedAssets.length} asset{selectedAssets.length>1?'s':''} will be included
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card>
            <div style={{ fontSize:11, color:'var(--text2)', fontWeight:500, marginBottom:'0.5rem' }}>4. Personal notes (optional)</div>
            <textarea value={personalNotes} onChange={e => { setPersonalNotes(e.target.value); setBrief('') }}
              placeholder="e.g. They specialize in balayage, their interior is very industrial/loft style, I want a dark moody design with gold accents, they told me they want a booking form..."
              style={{ minHeight:80, resize:'vertical', fontSize:12, lineHeight:1.6 }} />
          </Card>

          <Card>
            <div style={{ fontSize:11, color:'var(--text2)', fontWeight:500, marginBottom:'0.5rem' }}>5. Custom color palette (optional)</div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:8 }}>
              {customColors.map((c, i) => (
                <div key={i} style={{ position:'relative' }}>
                  <div style={{ width:32, height:32, borderRadius:'var(--r)', background:c,
                    border:'1px solid var(--border2)', cursor:'pointer' }}
                    title={c} onClick={() => { setCustomColors(cc => cc.filter((_,j) => j !== i)); setBrief('') }} />
                  <div style={{ fontSize:8, textAlign:'center', color:'var(--text3)', marginTop:2 }}>{c}</div>
                </div>
              ))}
              <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                <input type="color" value={colorInput} onChange={e => setColorInput(e.target.value)}
                  style={{ width:32, height:32, padding:0, border:'1px solid var(--border2)',
                    borderRadius:'var(--r)', cursor:'pointer', background:'none' }} />
                <button onClick={() => {
                  if (!customColors.includes(colorInput)) {
                    setCustomColors(cc => [...cc, colorInput]); setBrief('')
                  }
                }} style={{ fontSize:11, padding:'4px 8px', borderRadius:'var(--r)',
                  border:'1px solid var(--border2)', background:'var(--surface2)',
                  cursor:'pointer', color:'var(--text2)' }}>+ Add</button>
              </div>
            </div>
            {customColors.length > 0 && (
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ fontSize:10, color:'var(--text3)' }}>{customColors.length} colors — click a swatch to remove</div>
                <button onClick={() => { setCustomColors([]); setBrief('') }} style={{
                  fontSize:10, color:'var(--red)', background:'none', border:'none', cursor:'pointer'
                }}>Clear all</button>
              </div>
            )}
            {customColors.length === 0 && (
              <div style={{ fontSize:10, color:'var(--text3)' }}>Pick colors to override the auto-detected palette</div>
            )}
          </Card>

          <Card>
            <div style={{ fontSize:11, fontWeight:500, marginBottom:'0.75rem' }}>6. How to use</div>
            {['Select a lead','Analyze photos (if available)','Pick any assets','Click Generate',
              'Click Prepare site folder','Open the folder in Kiro',
              'Paste the brief into Kiro chat','Preview locally with npm run dev','Deploy to Vercel (free)'].map((s, i) => (
              <div key={i} style={{ display:'flex', gap:10, padding:'4px 0',
                borderBottom:'1px solid var(--border)', fontSize:12, color:'var(--text2)' }}>
                <span style={{ width:18, height:18, borderRadius:'50%', background:'var(--surface2)',
                  border:'1px solid var(--border2)', display:'inline-flex', alignItems:'center',
                  justifyContent:'center', fontSize:10, fontWeight:500, flexShrink:0 }}>{i+1}</span>
                {s}
              </div>
            ))}
          </Card>
        </div>

        <Card style={{ position:'sticky', top:0 }}>
          {brief ? (
            <>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
                <div style={{ fontSize:12, color:'var(--text2)' }}>
                  Ready to paste into Kiro chat
                  {visionAnalysis && <span style={{ color:'var(--green)', marginLeft:6 }}>📸 photo analysis included</span>}
                  {selectedAssets.length > 0 && <span style={{ color:'var(--blue)', marginLeft:6 }}>+ {selectedAssets.length} assets</span>}
                </div>
                <Btn sm onClick={copy}>{copied ? '✓ Copied!' : 'Copy'}</Btn>
              </div>
              <pre style={{ fontFamily:'var(--mono)', fontSize:11.5, lineHeight:1.75,
                whiteSpace:'pre-wrap', wordBreak:'break-word', color:'var(--text)',
                maxHeight:600, overflowY:'auto' }}>{brief}</pre>
              {saved && lead && (
                <div style={{ marginTop:'1rem', padding:'10px 14px', background:'var(--green-bg)',
                  borderRadius:'var(--r)', fontSize:12, color:'var(--green)', lineHeight:1.6 }}>
                  ✓ Brief saved to <code style={{ fontFamily:'var(--mono)' }}>sites/{lead.slug || toSlug(lead.name)}/BRIEF.md</code><br/>
                  {folderPhotos.length > 0 && <>{folderPhotos.length} photos in <code style={{ fontFamily:'var(--mono)' }}>photos/</code><br/></>}
                  Open <code style={{ fontFamily:'var(--mono)' }}>sites/{lead.slug || toSlug(lead.name)}/</code> in Kiro and paste the brief to start building.
                </div>
              )}
            </>
          ) : (
            <div style={{ textAlign:'center', padding:'3rem', color:'var(--text3)' }}>
              <div style={{ fontSize:36, marginBottom:'1rem' }}>📝</div>
              <div style={{ fontSize:13, marginBottom:6 }}>Select a lead and click Generate</div>
              <div style={{ fontSize:12, maxWidth:300, margin:'0 auto', lineHeight:1.6 }}>
                The brief includes business profile, review highlights, design direction, and your chosen assets — all formatted for Kiro.
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Photo lightbox */}
      {lightbox !== null && lead && (() => {
        const slug = lead.slug || toSlug(lead.name)
        const allPhotos = folderPhotos.map(f => ({ src:`/api/lead-images/${slug}/photos/${f}`, name:f }))
        const idx = folderPhotos.indexOf(lightbox.file)
        if (idx < 0 || !allPhotos[idx]) return null
        const go = (n) => setLightbox({ type:'folder', file:folderPhotos[n], slug })
        return (
          <div onClick={() => setLightbox(null)} style={{
            position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:300,
            display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer'
          }}>
            {idx > 0 && (
              <button onClick={e => { e.stopPropagation(); go(idx - 1) }} style={{
                position:'absolute', left:16, top:'50%', transform:'translateY(-50%)',
                background:'rgba(255,255,255,0.15)', border:'none', color:'#fff',
                width:40, height:40, borderRadius:'50%', fontSize:20, cursor:'pointer',
                display:'flex', alignItems:'center', justifyContent:'center'
              }}>‹</button>
            )}
            <div onClick={e => e.stopPropagation()} style={{ position:'relative', maxWidth:'90vw', maxHeight:'85vh' }}>
              <img src={allPhotos[idx].src} alt={allPhotos[idx].name} style={{
                maxWidth:'90vw', maxHeight:'85vh', objectFit:'contain', borderRadius:8
              }} />
              <div style={{ position:'absolute', bottom:-32, left:'50%', transform:'translateX(-50%)',
                color:'rgba(255,255,255,0.7)', fontSize:13, whiteSpace:'nowrap' }}>
                {allPhotos[idx].name} — {idx + 1} of {allPhotos.length}
              </div>
            </div>
            {idx < allPhotos.length - 1 && (
              <button onClick={e => { e.stopPropagation(); go(idx + 1) }} style={{
                position:'absolute', right:16, top:'50%', transform:'translateY(-50%)',
                background:'rgba(255,255,255,0.15)', border:'none', color:'#fff',
                width:40, height:40, borderRadius:'50%', fontSize:20, cursor:'pointer',
                display:'flex', alignItems:'center', justifyContent:'center'
              }}>›</button>
            )}
            <button onClick={() => setLightbox(null)} style={{
              position:'absolute', top:16, right:16, background:'none', border:'none',
              color:'#fff', fontSize:24, cursor:'pointer'
            }}>✕</button>
          </div>
        )
      })()}
    </div>
  )
}
