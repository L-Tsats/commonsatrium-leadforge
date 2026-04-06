// src/pages/AssetsPage.jsx
import { useState, useRef, useEffect } from 'react'
import { getAssets, addAsset, updateAsset, deleteAsset, getInboxFiles } from '../lib/api'
import { Btn, Card, PageHeader, Badge, Field, Spinner } from '../components/ui'

const TYPE_META = {
  snippet: { label: 'Code Snippet',   icon: '{ }', color: 'blue',  desc: 'Nav bars, footers, hero sections, components' },
  palette: { label: 'Palette / Font', icon: '🎨',  color: 'amber', desc: 'Color palettes, typography choices, CSS variables' },
  image:   { label: 'Image / Logo',   icon: '🖼️',  color: 'green', desc: 'Logos, icons, brand assets — stored as base64' },
  url:     { label: 'Reference URL',  icon: '🔗',  color: 'gray',  desc: 'Inspiration sites, design references, examples' },
}

export default function AssetsPage({ toast }) {
  const [assets, setAssets] = useState([])
  const [filter, setFilter] = useState('all')
  const [editing, setEditing] = useState(null)
  const [newType, setNewType] = useState('snippet')
  const [inboxFiles, setInboxFiles] = useState([])
  const [sorting, setSorting] = useState(false)
  const [sortProgress, setSortProgress] = useState('')

  // Load assets on mount
  useEffect(() => { reload() }, [])

  async function reload() {
    try { setAssets(await getAssets()) } catch {}
  }

  async function loadInbox() {
    try {
      const data = await getInboxFiles()
      setInboxFiles(data.files || [])
    } catch { setInboxFiles([]) }
  }

  async function sortInbox() {
    setSorting(true); setSortProgress('Starting...')
    try {
      const response = await fetch('/api/common-assets/sort-inbox', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (trimmed.startsWith('data: ')) {
            try {
              const msg = JSON.parse(trimmed.slice(6))
              if (msg.progress) setSortProgress(msg.progress)
              if (msg.done) toast(`✓ Sorted ${msg.sorted} images into common-assets`)
            } catch {}
          }
        }
      }
    } catch (e) { toast(e.message, 'error') }
    finally { setSorting(false); setSortProgress(''); loadInbox() }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this asset?')) return
    await deleteAsset(id)
    reload()
    toast('Asset deleted')
  }

  function handleEdit(asset) { setEditing(asset) }

  function handleNew(type) {
    setNewType(type)
    setEditing('new')
  }

  const filtered = filter === 'all' ? assets : assets.filter(a => a.type === filter)

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      <PageHeader title="Assets Library">
        <div style={{ display:'flex', gap:8 }}>
          {Object.entries(TYPE_META).map(([type, m]) => (
            <Btn key={type} sm onClick={() => handleNew(type)}>
              + {m.label}
            </Btn>
          ))}
        </div>
      </PageHeader>

      <div style={{ flex:1, overflowY:'auto', padding:'1.25rem' }}>
        {/* Type filter tabs */}
        <div style={{ display:'flex', borderBottom:'1px solid var(--border)', gap:0, marginBottom:'1.25rem' }}>
          {[['all','All'], ...Object.entries(TYPE_META).map(([k,v]) => [k, v.label + 's'])].map(([k,l]) => (
            <button key={k} onClick={() => setFilter(k)} style={{
              padding:'6px 16px', fontSize:13, background:'none', border:'none',
              borderBottom: filter===k ? '2px solid var(--text)' : '2px solid transparent',
              color: filter===k ? 'var(--text)' : 'var(--text2)',
              fontWeight: filter===k ? 500 : 400, cursor:'pointer', marginBottom:-1
            }}>{l} {k==='all' ? `(${assets.length})` : `(${assets.filter(a=>a.type===k).length})`}</button>
          ))}
        </div>

        {/* Stock Assets Inbox */}
        <Card style={{ marginBottom:'1.25rem' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.75rem' }}>
            <div>
              <div style={{ fontWeight:500, fontSize:13 }}>📦 Stock Assets Inbox</div>
              <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>
                Drop images into <code style={{ fontFamily:'var(--mono)', fontSize:10 }}>common-assets/inbox/</code> then sort them with AI
              </div>
            </div>
            <div style={{ display:'flex', gap:6 }}>
              <Btn sm onClick={loadInbox}>↻ Check inbox</Btn>
              <Btn sm variant="primary" onClick={sortInbox} disabled={sorting || !inboxFiles.length}>
                {sorting ? <><Spinner size={10}/> Sorting...</> : `🤖 Sort ${inboxFiles.length || ''} images`}
              </Btn>
            </div>
          </div>
          {sorting && sortProgress && (
            <div style={{ padding:'6px 10px', background:'var(--surface2)', borderRadius:'var(--r)',
              fontSize:11, color:'var(--text2)', marginBottom:8, display:'flex', alignItems:'center', gap:6 }}>
              <Spinner size={12}/> {sortProgress}
            </div>
          )}
          {inboxFiles.length > 0 && !sorting && (
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {inboxFiles.map(f => (
                <img key={f} src={`/api/common-assets-files/inbox/${f}`} alt={f} title={f}
                  style={{ width:48, height:48, objectFit:'cover', borderRadius:4, border:'1px solid var(--border)' }} />
              ))}
            </div>
          )}
          {inboxFiles.length === 0 && !sorting && (
            <div style={{ fontSize:12, color:'var(--text3)', padding:'0.5rem 0' }}>
              Inbox empty — drop images into <code style={{ fontFamily:'var(--mono)', fontSize:10 }}>common-assets/inbox/</code> and hit "Check inbox"
            </div>
          )}
        </Card>

        {/* Quick-add type cards when empty */}
        {assets.length === 0 && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'1rem', marginBottom:'1.5rem' }}>
            {Object.entries(TYPE_META).map(([type, m]) => (
              <button key={type} onClick={() => handleNew(type)} style={{
                background:'var(--surface)', border:'1px dashed var(--border2)',
                borderRadius:'var(--rl)', padding:'1.5rem', textAlign:'left',
                cursor:'pointer', transition:'all 0.12s'
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--text)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border2)'}
              >
                <div style={{ fontSize:24, marginBottom:8 }}>{m.icon}</div>
                <div style={{ fontWeight:500, fontSize:13, marginBottom:4 }}>+ Add {m.label}</div>
                <div style={{ fontSize:12, color:'var(--text2)', lineHeight:1.5 }}>{m.desc}</div>
              </button>
            ))}
          </div>
        )}

        {/* Asset grid */}
        {filtered.length > 0 && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(320px, 1fr))', gap:'1rem' }}>
            {filtered.map(asset => (
              <AssetCard key={asset.id} asset={asset}
                onEdit={() => handleEdit(asset)}
                onDelete={() => handleDelete(asset.id)}
              />
            ))}
          </div>
        )}

        {filtered.length === 0 && assets.length > 0 && (
          <div style={{ textAlign:'center', padding:'3rem', color:'var(--text3)', fontSize:13 }}>
            No {filter} assets yet.
            <button onClick={() => handleNew(filter)} style={{ marginLeft:6, color:'var(--blue)', background:'none', border:'none', cursor:'pointer', fontSize:13 }}>
              Add one →
            </button>
          </div>
        )}
      </div>

      {/* Editor modal */}
      {editing && (
        <AssetEditor
          asset={editing === 'new' ? null : editing}
          defaultType={editing === 'new' ? newType : editing.type}
          onSave={async (data) => {
            if (editing === 'new') {
              await addAsset(data)
              toast('✓ Asset added')
            } else {
              await updateAsset(editing.id, data)
              toast('✓ Asset updated')
            }
            reload()
            setEditing(null)
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

// ── Asset Card ──────────────────────────────────────────────────────────────

function AssetCard({ asset, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const m = TYPE_META[asset.type] || TYPE_META.snippet

  return (
    <Card style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:18 }}>{m.icon}</span>
          <div>
            <div style={{ fontWeight:500, fontSize:13 }}>{asset.name}</div>
            <Badge color={m.color}>{m.label}</Badge>
          </div>
        </div>
        <div style={{ display:'flex', gap:6, flexShrink:0 }}>
          <Btn sm onClick={onEdit}>Edit</Btn>
          <Btn sm variant="danger" onClick={onDelete}>✕</Btn>
        </div>
      </div>

      {/* Preview by type */}
      {asset.type === 'snippet' && (
        <div>
          <pre style={{
            background:'var(--surface2)', borderRadius:'var(--r)', padding:'10px 12px',
            fontSize:11, fontFamily:'var(--mono)', lineHeight:1.6,
            maxHeight: expanded ? 400 : 80, overflow:'hidden',
            whiteSpace:'pre-wrap', wordBreak:'break-word', color:'var(--text)',
            cursor:'pointer', transition:'max-height 0.2s'
          }} onClick={() => setExpanded(e => !e)}>
            {asset.content}
          </pre>
          {(asset.content||'').split('\n').length > 4 && (
            <button onClick={() => setExpanded(e => !e)} style={{
              fontSize:11, color:'var(--blue)', background:'none', border:'none',
              cursor:'pointer', marginTop:4
            }}>{expanded ? '▲ Collapse' : '▼ Show all'}</button>
          )}
        </div>
      )}

      {asset.type === 'palette' && (
        <div>
          {/* Parse hex colors from content and show swatches */}
          <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:8 }}>
            {[...(asset.content||'').matchAll(/#[0-9a-fA-F]{3,6}/g)].slice(0,10).map((m,i) => (
              <div key={i} title={m[0]} style={{
                width:28, height:28, borderRadius:'var(--r)',
                background:m[0], border:'1px solid var(--border2)',
                flexShrink:0
              }} />
            ))}
          </div>
          <pre style={{
            background:'var(--surface2)', borderRadius:'var(--r)', padding:'8px 10px',
            fontSize:11, fontFamily:'var(--mono)', lineHeight:1.6,
            maxHeight:80, overflow:'hidden', whiteSpace:'pre-wrap', wordBreak:'break-word', color:'var(--text)'
          }}>{asset.content}</pre>
        </div>
      )}

      {asset.type === 'image' && (
        <div style={{ display:'flex', gap:'0.75rem', alignItems:'center' }}>
          {asset.data && (
            <img src={asset.data} alt={asset.name} style={{
              width:64, height:64, objectFit:'contain',
              borderRadius:'var(--r)', border:'1px solid var(--border)',
              background:'var(--surface2)'
            }} />
          )}
          <div style={{ fontSize:12, color:'var(--text2)', lineHeight:1.6 }}>
            {asset.filename && <div>📄 {asset.filename}</div>}
            {asset.instructions && <div style={{ color:'var(--text3)', marginTop:2 }}>{asset.instructions}</div>}
          </div>
        </div>
      )}

      {asset.type === 'url' && (
        <div>
          <a href={asset.url} target="_blank" rel="noreferrer" style={{
            fontSize:12, color:'var(--blue)', wordBreak:'break-all',
            display:'block', marginBottom:4
          }}>{asset.url}</a>
          {asset.notes && <div style={{ fontSize:12, color:'var(--text2)', lineHeight:1.5 }}>{asset.notes}</div>}
        </div>
      )}
    </Card>
  )
}

// ── Asset Editor Modal ──────────────────────────────────────────────────────

function AssetEditor({ asset, defaultType, onSave, onClose }) {
  const [type, setType] = useState(asset?.type || defaultType)
  const [name, setName] = useState(asset?.name || '')
  const [content, setContent] = useState(asset?.content || '')
  const [url, setUrl] = useState(asset?.url || '')
  const [notes, setNotes] = useState(asset?.notes || '')
  const [instructions, setInstructions] = useState(asset?.instructions || '')
  const [imageData, setImageData] = useState(asset?.data || null)
  const [filename, setFilename] = useState(asset?.filename || '')
  const fileRef = useRef()

  function handleImageUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { alert('Image must be under 2MB'); return }
    setFilename(file.name)
    if (!name) setName(file.name.replace(/\.[^.]+$/, ''))
    const reader = new FileReader()
    reader.onload = ev => setImageData(ev.target.result)
    reader.readAsDataURL(file)
  }

  function handleSave() {
    if (!name.trim()) { alert('Give this asset a name'); return }
    const base = { type, name: name.trim() }
    if (type === 'snippet' || type === 'palette') {
      if (!content.trim()) { alert('Content cannot be empty'); return }
      onSave({ ...base, content })
    } else if (type === 'url') {
      if (!url.trim()) { alert('Enter a URL'); return }
      onSave({ ...base, url, notes })
    } else if (type === 'image') {
      onSave({ ...base, data: imageData, filename, instructions })
    }
  }

  const m = TYPE_META[type]

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', zIndex:200 }} />
      <div style={{
        position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)',
        width:600, maxWidth:'95vw', maxHeight:'90vh',
        background:'var(--surface)', borderRadius:'var(--rl)',
        boxShadow:'0 20px 60px rgba(0,0,0,0.2)',
        zIndex:201, display:'flex', flexDirection:'column', overflow:'hidden'
      }}>
        {/* Header */}
        <div style={{ padding:'1rem 1.25rem', borderBottom:'1px solid var(--border)',
          display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <div style={{ fontWeight:600, fontSize:14 }}>
            {asset ? 'Edit' : 'New'} {m.label}
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:18, color:'var(--text3)', cursor:'pointer' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex:1, overflowY:'auto', padding:'1.25rem', display:'flex', flexDirection:'column', gap:'1rem' }}>
          {/* Type switcher (only for new) */}
          {!asset && (
            <Field label="Asset type">
              <div style={{ display:'flex', gap:6 }}>
                {Object.entries(TYPE_META).map(([t,meta]) => (
                  <button key={t} onClick={() => setType(t)} style={{
                    flex:1, padding:'8px', fontSize:12, borderRadius:'var(--r)',
                    border:'1px solid var(--border2)',
                    background: type===t ? 'var(--accent)' : 'var(--surface)',
                    color: type===t ? '#fff' : 'var(--text2)',
                    cursor:'pointer', fontWeight: type===t ? 500 : 400,
                    display:'flex', flexDirection:'column', alignItems:'center', gap:4
                  }}>
                    <span>{meta.icon}</span>
                    <span>{meta.label}</span>
                  </button>
                ))}
              </div>
            </Field>
          )}

          <Field label="Name — how it appears in the library">
            <input value={name} onChange={e => setName(e.target.value)} placeholder={
              type==='snippet' ? 'e.g. Standard Nav Bar' :
              type==='palette' ? 'e.g. Mediterranean Warm' :
              type==='image'   ? 'e.g. My Logo PNG' :
              'e.g. Awwwards inspiration'
            } autoFocus />
          </Field>

          {(type === 'snippet' || type === 'palette') && (
            <Field label={type==='snippet' ? 'Code — paste your component, snippet, or template' : 'Palette — colors, fonts, CSS variables'}>
              <textarea value={content} onChange={e => setContent(e.target.value)}
                style={{ minHeight:240, resize:'vertical', fontSize:12, fontFamily:'var(--mono)', lineHeight:1.7 }}
                placeholder={type==='snippet'
                  ? `// Example:\nconst Navbar = () => (\n  <nav className="...">\n    ...\n  </nav>\n)`
                  : `// Example:\n--primary: #2D6A4F;\n--accent: #B7E4C7;\n--text: #1B1B1B;\nFont: Fraunces (headings) + DM Sans (body)`
                }
              />
            </Field>
          )}

          {type === 'url' && (
            <>
              <Field label="URL">
                <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com" />
              </Field>
              <Field label="Notes — what to borrow from this site (optional)">
                <textarea value={notes} onChange={e => setNotes(e.target.value)}
                  style={{ minHeight:80, resize:'vertical', fontSize:13 }}
                  placeholder="e.g. Love the hero layout, the card grid style, and the footer structure" />
              </Field>
            </>
          )}

          {type === 'image' && (
            <>
              <div style={{ border:'2px dashed var(--border2)', borderRadius:'var(--rl)',
                padding:'2rem', textAlign:'center', cursor:'pointer' }}
                onClick={() => fileRef.current?.click()}>
                {imageData
                  ? <img src={imageData} alt="" style={{ maxHeight:120, maxWidth:'100%', objectFit:'contain', borderRadius:'var(--r)' }} />
                  : <>
                      <div style={{ fontSize:32, marginBottom:8 }}>🖼️</div>
                      <div style={{ fontSize:13, color:'var(--text2)' }}>Click to upload image or logo</div>
                      <div style={{ fontSize:11, color:'var(--text3)', marginTop:4 }}>PNG, JPG, SVG, WEBP — max 2MB</div>
                    </>
                }
                <input ref={fileRef} type="file" accept="image/*" onChange={handleImageUpload} style={{ display:'none' }} />
              </div>
              {imageData && (
                <Btn sm onClick={() => fileRef.current?.click()}>Replace image</Btn>
              )}
              <Field label="Usage instructions for Kiro (optional)">
                <textarea value={instructions} onChange={e => setInstructions(e.target.value)}
                  style={{ minHeight:70, resize:'vertical', fontSize:13 }}
                  placeholder="e.g. Use this as the site favicon and in the footer. Dark backgrounds only." />
              </Field>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:'1rem 1.25rem', borderTop:'1px solid var(--border)',
          display:'flex', justifyContent:'flex-end', gap:8, flexShrink:0 }}>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={handleSave}>
            {asset ? 'Save changes' : `Add ${m.label}`}
          </Btn>
        </div>
      </div>
    </>
  )
}
