// src/components/ui.jsx
import { useState, useEffect } from 'react'

export function Btn({ children, onClick, variant='default', disabled, style={}, type='button', sm }) {
  const pad = sm ? '5px 10px' : '7px 14px'
  const fsz = sm ? 12 : 13
  const base = { padding: pad, fontSize: fsz, fontWeight: 500, borderRadius: 'var(--r)',
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
    transition: 'all 0.12s', display: 'inline-flex', alignItems: 'center', gap: 5, ...style }
  const v = {
    default: { background:'var(--surface)', border:'1px solid var(--border2)', color:'var(--text)' },
    primary: { background:'var(--accent)',  border:'1px solid var(--accent)',  color:'#fff' },
    danger:  { background:'var(--red-bg)',  border:'1px solid var(--red-bg)',  color:'var(--red)' },
    ghost:   { background:'transparent',    border:'1px solid transparent',    color:'var(--text2)' },
  }
  return <button type={type} onClick={onClick} disabled={disabled} style={{ ...base, ...v[variant] }}>{children}</button>
}

export function Card({ children, style={}, p='1.25rem' }) {
  return <div style={{ background:'var(--surface)', border:'1px solid var(--border)',
    borderRadius:'var(--rl)', padding:p, boxShadow:'var(--sh)', ...style }}>{children}</div>
}

export function Badge({ children, color='gray' }) {
  const c = { green:{bg:'var(--green-bg)',tx:'var(--green)'}, amber:{bg:'var(--amber-bg)',tx:'var(--amber)'},
    blue:{bg:'var(--blue-bg)',tx:'var(--blue)'}, red:{bg:'var(--red-bg)',tx:'var(--red)'},
    gray:{bg:'var(--gray-bg)',tx:'var(--gray)'} }[color] || { bg:'var(--gray-bg)', tx:'var(--gray)' }
  return <span style={{ display:'inline-flex', alignItems:'center', padding:'2px 8px',
    borderRadius:20, fontSize:11, fontWeight:500, background:c.bg, color:c.tx }}>{children}</span>
}

export function PageHeader({ title, children }) {
  return <div style={{ background:'var(--surface)', borderBottom:'1px solid var(--border)',
    padding:'0.875rem 1.5rem', display:'flex', alignItems:'center', justifyContent:'space-between',
    flexShrink:0 }}>
    <h1 style={{ fontSize:15, fontWeight:600 }}>{title}</h1>
    <div style={{ display:'flex', gap:8 }}>{children}</div>
  </div>
}

export function Stat({ label, value, sub }) {
  return <div style={{ background:'var(--surface2)', borderRadius:'var(--r)', padding:'0.875rem 1rem' }}>
    <div style={{ fontSize:11, color:'var(--text2)', marginBottom:3 }}>{label}</div>
    <div style={{ fontSize:22, fontWeight:600, letterSpacing:'-0.02em' }}>{value}</div>
    {sub && <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>{sub}</div>}
  </div>
}

export function Field({ label, children, style={} }) {
  return <div style={style}>
    <label style={{ fontSize:11, color:'var(--text2)', display:'block', marginBottom:4 }}>{label}</label>
    {children}
  </div>
}

export function Spinner({ size=16 }) {
  return <span style={{ display:'inline-block', width:size, height:size,
    border:'2px solid var(--border2)', borderTopColor:'var(--text)',
    borderRadius:'50%', animation:'spin 0.6s linear infinite', flexShrink:0 }} />
}

export function Stars({ r }) {
  return <span style={{ color:'#ba7517', fontSize:12 }}>★ <b style={{ fontWeight:500 }}>{r}</b></span>
}

export function StageBadge({ stage }) {
  const m = { new:['gray','New'], emailed:['blue','Emailed'], in_progress:['amber','In progress'],
    site_built:['green','Site built'], closed:['green','Closed ✓'] }
  const [c,l] = m[stage] || ['gray', stage]
  return <Badge color={c}>{l}</Badge>
}

export function ContactBadge({ lead }) {
  if (lead.email) return <Badge color="green">📧 Email</Badge>
  const social = lead.social || {}
  const hasSocials = Object.keys(social).some(k =>
    k.includes('Facebook') || k.includes('Instagram') || k.includes('Tiktok') || k.includes('Linkedin')
  )
  if (hasSocials) return <Badge color="blue">💬 Socials</Badge>
  if (lead.phone) return <Badge color="amber">📞 Phone</Badge>
  return <Badge color="red">No contact</Badge>
}

// Toast system
export function ToastContainer({ toasts }) {
  return <div style={{ position:'fixed', bottom:24, right:24, display:'flex', flexDirection:'column',
    gap:8, zIndex:1000 }}>
    {toasts.map(t => <div key={t.id} style={{ padding:'10px 16px', borderRadius:'var(--r)',
      background: t.type==='error' ? 'var(--red)' : '#1a1a18',
      color:'#fff', fontSize:13, boxShadow:'0 4px 12px rgba(0,0,0,0.2)',
      animation:'fadeIn 0.2s ease' }}>{t.msg}</div>)}
  </div>
}

export function useToast() {
  const [toasts, setToasts] = useState([])
  const toast = (msg, type='info') => {
    const id = Date.now()
    setToasts(t => [...t, { id, msg, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3200)
  }
  return { toasts, toast }
}

// Config banner — shows if API keys are missing
export function ConfigBanner() {
  const [cfg, setCfg] = useState(null)
  useEffect(() => {
    fetch('/api/config').then(r => r.json()).then(setCfg).catch(() => {})
  }, [])
  if (!cfg || (cfg.hasGoogle && cfg.hasPerplexity && cfg.hasSmtp)) return null
  return <div style={{ background:'var(--amber-bg)', color:'var(--amber)', padding:'8px 1.5rem',
    fontSize:12, borderBottom:'1px solid rgba(0,0,0,0.07)', display:'flex', gap:'1.5rem' }}>
    ⚠️ Missing config:
    {!cfg.hasGoogle    && <span>Google Places API key</span>}
    {!cfg.hasAnthropic && <span>Anthropic API key</span>}
    {!cfg.hasPerplexity && <span>Perplexity API key</span>}
    {!cfg.hasSmtp   && <span>SMTP credentials</span>}
    <span style={{ color:'var(--text2)' }}>— edit your <code>.env</code> file and restart.</span>
  </div>
}
