import { useState, useRef, useEffect } from 'react'
import { fillTemplate } from '../lib/store'
import { getTemplates, saveTemplates, getLeads, getEmailQueue, removeFromQueue, clearSentEmails, getConfig } from '../lib/api'
import { Btn, Card, PageHeader, Field, Spinner, Badge } from '../components/ui'

const PLACEHOLDERS = [
  { key:'{{business_name}}', desc:'Business name' },
  { key:'{{category}}', desc:'Business category' },
  { key:'{{rating}}', desc:'Star rating' },
  { key:'{{review_count}}', desc:'Number of reviews' },
  { key:'{{neighborhood}}', desc:'Neighborhood/area' },
  { key:'{{top_review_snippet}}', desc:'Best review quote' },
  { key:'{{demo_link}}', desc:'Demo site URL' },
  { key:'{{your_name}}', desc:'Your name' },
]

export default function EmailPage({ toast }) {
  const [templates, setTemplates] = useState({})
  const [sel, setSel] = useState('cold')
  const bodyRef = useRef()
  const [queue, setQueue] = useState([])
  const [sending, setSending] = useState(false)
  const [sendProgress, setSendProgress] = useState('')
  const [previewLead, setPreviewLead] = useState('')
  const [overrides, setOverrides] = useState({})
  const [leads, setLeads] = useState([])

  // Load FROM_NAME from config
  const [fromName, setFromName] = useState('')
  useEffect(() => {
    getConfig().then(d => setFromName(d.fromName || '')).catch(() => {})
  }, [])

  useEffect(() => { loadQueue() }, [])

  // Load templates and leads on mount
  useEffect(() => {
    getTemplates().then(t => setTemplates(t)).catch(() => {})
    getLeads().then(l => setLeads(l)).catch(() => {})
  }, [])

  async function loadQueue() {
    try { const d = await getEmailQueue(); setQueue(d.queue || []) } catch {}
  }

  async function sendBatch() {
    const pending = queue.filter(e => e.status === 'pending')
    if (!pending.length) { toast('No pending emails', 'error'); return }
    if (!confirm(`Send ${pending.length} emails with 2-minute delays between each?`)) return
    setSending(true); setSendProgress('Starting...')
    try {
      const response = await fetch('/api/email/send-batch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delaySeconds: 120 })
      })
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
              if (msg.progress) setSendProgress(msg.progress)
              if (msg.done) toast(`✓ Sent ${msg.sent}/${msg.total} emails`)
            } catch {}
          }
        }
      }
    } catch (e) { toast(e.message, 'error') }
    finally { setSending(false); setSendProgress(''); loadQueue() }
  }

  const tpl = templates[sel] || {}

  function upd(k,v) { setTemplates(t => ({...t, [sel]: {...t[sel], [k]: v}})) }

  function insert(p) {
    const el = bodyRef.current; if (!el) return
    const s = el.selectionStart, e = el.selectionEnd
    const v = el.value.slice(0,s) + p + el.value.slice(e)
    upd('body', v)
    setTimeout(() => { el.focus(); el.selectionStart = el.selectionEnd = s + p.length }, 0)
  }

  async function save() {
    await saveTemplates(templates)
    toast('✓ Templates saved')
  }

  function addTemplate() {
    const key = `custom_${Date.now()}`
    setTemplates(t => ({ ...t, [key]: { name:'New template', subject:'', body:'' } }))
    setSel(key)
  }

  function deleteTemplate() {
    if (Object.keys(templates).length <= 1) { toast('Need at least one template', 'error'); return }
    if (!confirm('Delete this template?')) return
    const { [sel]: _, ...rest } = templates
    setTemplates(rest)
    setSel(Object.keys(rest)[0])
  }

  const lead = leads.find(l => l.id === previewLead)

  // Build the preview values — lead data with overrides applied
  const previewVars = lead ? {
    business_name:      overrides.business_name ?? lead.name ?? '',
    category:           overrides.category ?? lead.category ?? '',
    rating:             overrides.rating ?? String(lead.rating || ''),
    review_count:       overrides.review_count ?? String(lead.reviewCount || ''),
    neighborhood:       overrides.neighborhood ?? lead.neighborhood ?? '',
    top_review_snippet: overrides.top_review_snippet ?? (lead.reviewSnippet || '').slice(0, 100),
    demo_link:          overrides.demo_link ?? lead.demoUrl ?? '[add demo link]',
    your_name:          overrides.your_name ?? fromName ?? '',
  } : null

  const previewSubject = previewVars && tpl.subject ? fillTemplate(tpl.subject, lead, { ...previewVars, yourName: previewVars.your_name, demoLink: previewVars.demo_link }) : ''
  const previewBody = previewVars && tpl.body ? fillTemplate(tpl.body, lead, { ...previewVars, yourName: previewVars.your_name, demoLink: previewVars.demo_link }) : ''

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      <PageHeader title="Email Templates">
        <Btn variant="primary" onClick={save}>Save templates</Btn>
      </PageHeader>
      <div style={{ flex:1, overflowY:'auto', padding:'1.25rem',
        display:'grid', gridTemplateColumns:'280px 1fr', gap:'1.25rem', alignItems:'start' }}>

        <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
          <Card p="0.875rem">
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.75rem' }}>
              <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.07em' }}>Templates</div>
              <button onClick={addTemplate} style={{ fontSize:14, background:'none', border:'none',
                cursor:'pointer', color:'var(--blue)', lineHeight:1 }} title="Add new template">+</button>
            </div>
            {Object.entries(templates).map(([k,t]) => (
              <button key={k} onClick={()=>setSel(k)} style={{
                display:'block', width:'100%', textAlign:'left', padding:'8px 10px',
                borderRadius:'var(--r)', marginBottom:4, cursor:'pointer',
                background: sel===k ? 'var(--surface2)' : 'transparent',
                border: sel===k ? '1px solid var(--border2)' : '1px solid transparent',
                fontSize:12, fontWeight: sel===k ? 500 : 400, color:'var(--text)'
              }}>{t.name}</button>
            ))}
          </Card>

          <Card p="0.875rem">
            <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'0.75rem' }}>Insert placeholder</div>
            <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
              {PLACEHOLDERS.map(p => (
                <button key={p.key} onClick={()=>insert(p.key)} style={{ fontSize:11, fontFamily:'var(--mono)',
                  padding:'4px 8px', borderRadius:4, background:'var(--blue-bg)', color:'var(--blue)',
                  border:'none', cursor:'pointer', textAlign:'left', display:'flex', justifyContent:'space-between', gap:8 }}>
                  <span>{p.key}</span>
                  <span style={{ fontFamily:'inherit', fontSize:10, color:'var(--text3)' }}>{p.desc}</span>
                </button>
              ))}
            </div>
            <div style={{ fontSize:10, color:'var(--text3)', marginTop:8, lineHeight:1.5 }}>
              Click a placeholder to insert it at your cursor position in the email body. They get replaced with real lead data when you preview or send.
            </div>
          </Card>

          <Card p="0.875rem">
            <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'0.75rem' }}>Preview with lead</div>
            <select value={previewLead} onChange={e => { setPreviewLead(e.target.value); setOverrides({}) }} style={{ fontSize:12 }}>
              <option value="">— select a lead to preview —</option>
              {leads.filter(l => l.email).map(l => <option key={l.id} value={l.id}>{l.name} ({l.email})</option>)}
            </select>
          </Card>
        </div>

        <Card>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
            <div style={{ fontSize:13, fontWeight:500 }}>Edit template</div>
            <Btn sm variant="danger" onClick={deleteTemplate}>Delete template</Btn>
          </div>
          <Field label="Template name" style={{ marginBottom:'1rem' }}>
            <input value={tpl.name||''} onChange={e=>upd('name',e.target.value)}/>
          </Field>
          <Field label="Subject line" style={{ marginBottom:'1rem' }}>
            <input value={tpl.subject||''} onChange={e=>upd('subject',e.target.value)}/>
          </Field>
          <Field label="Email body">
            <textarea ref={bodyRef} value={tpl.body||''} onChange={e=>upd('body',e.target.value)}
              style={{ minHeight:200, resize:'vertical', fontSize:13, lineHeight:1.8 }}/>
          </Field>

          {/* Live preview */}
          {lead && previewVars && (
            <div style={{ marginTop:'1rem', borderTop:'1px solid var(--border)', paddingTop:'1rem' }}>
              <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'0.75rem' }}>
                Preview for {lead.name}
              </div>

              {/* Editable placeholder values */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:'1rem' }}>
                {PLACEHOLDERS.map(p => {
                  const key = p.key.replace(/\{/g,'').replace(/\}/g,'')
                  return (
                    <div key={key} style={{ display:'flex', flexDirection:'column', gap:2 }}>
                      <label style={{ fontSize:9, color:'var(--text3)' }}>{p.desc}</label>
                      <input value={previewVars[key] || ''} onChange={e => setOverrides(o => ({ ...o, [key]: e.target.value }))}
                        style={{ fontSize:11, padding:'4px 6px' }} />
                    </div>
                  )
                })}
              </div>

              {/* Rendered preview */}
              <div style={{ background:'var(--surface2)', borderRadius:'var(--r)', padding:'1rem' }}>
                <div style={{ fontSize:12, color:'var(--text3)', marginBottom:4 }}>To: {lead.email}</div>
                <div style={{ fontSize:13, fontWeight:500, marginBottom:'0.75rem' }}>{previewSubject}</div>
                <div style={{ fontSize:13, lineHeight:1.8, whiteSpace:'pre-wrap', color:'var(--text)' }}>{previewBody}</div>
              </div>
            </div>
          )}
        </Card>

        {/* Email Queue */}
        <Card style={{ gridColumn:'1 / -1' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
            <div>
              <div style={{ fontWeight:500, fontSize:13 }}>📋 Email Queue</div>
              <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>
                {queue.filter(e=>e.status==='pending').length} pending · {queue.filter(e=>e.status==='sent').length} sent · {queue.filter(e=>e.status==='failed').length} failed
              </div>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <Btn sm onClick={loadQueue}>↻ Refresh</Btn>
              <Btn sm onClick={async () => { await clearSentEmails(); loadQueue(); toast('Cleared sent emails') }}>Clear sent</Btn>
              <Btn sm variant="primary" onClick={sendBatch} disabled={sending || !queue.filter(e=>e.status==='pending').length}>
                {sending ? <><Spinner size={10}/> Sending...</> : `🚀 Send batch (${queue.filter(e=>e.status==='pending').length})`}
              </Btn>
            </div>
          </div>
          {sending && sendProgress && (
            <div style={{ padding:'8px 12px', background:'var(--surface2)', borderRadius:'var(--r)',
              fontSize:12, color:'var(--text2)', marginBottom:'0.75rem', display:'flex', alignItems:'center', gap:8 }}>
              <Spinner size={12}/> {sendProgress}
            </div>
          )}
          {queue.length === 0 ? (
            <div style={{ fontSize:12, color:'var(--text3)', padding:'1.5rem 0', textAlign:'center' }}>
              No emails queued. Open a lead → Email tab → "Add to queue" to start.
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:4, maxHeight:300, overflowY:'auto' }}>
              {queue.map(e => (
                <div key={e.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                  padding:'8px 10px', background:'var(--surface2)', borderRadius:'var(--r)', fontSize:12 }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {e.leadName || e.to}
                    </div>
                    <div style={{ fontSize:11, color:'var(--text3)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {e.subject}
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:6, alignItems:'center', flexShrink:0, marginLeft:8 }}>
                    <Badge color={e.status==='sent' ? 'green' : e.status==='failed' ? 'red' : 'gray'}>
                      {e.status}
                    </Badge>
                    {e.status === 'pending' && (
                      <button onClick={async () => { await removeFromQueue(e.id); loadQueue() }}
                        style={{ fontSize:11, color:'var(--red)', background:'none', border:'none', cursor:'pointer' }}>✕</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
