import { useState, useEffect } from 'react'
import { getLeads, getStats, deleteLead as apiDeleteLead, exportCsv, deleteLeadFolder } from '../lib/api'
import { toSlug, scoreLead } from '../lib/store'
import { Btn, Card, PageHeader, Stat, Stars, StageBadge, ContactBadge, Spinner, Badge } from '../components/ui'
import LeadDrawer from '../components/LeadDrawer'

const STAGES = [
  { key:null,          label:'All' },
  { key:'new',         label:'New' },
  { key:'emailed',     label:'Emailed' },
  { key:'in_progress', label:'In progress' },
  { key:'site_built',  label:'Site built' },
  { key:'closed',      label:'Closed' },
]

export default function LeadsPage({ toast }) {
  const [leads, setLeads] = useState([])
  const [stats, setStats] = useState(null)
  const [stage, setStage] = useState(null)
  const [search, setSearch] = useState('')
  const [drawer, setDrawer] = useState(null)
  const [enrichingAll, setEnrichingAll] = useState(false)
  const [groupBy, setGroupBy] = useState('category') // 'none' | 'category'
  const [collapsed, setCollapsed] = useState({})
  const [sortBy, setSortBy] = useState('score') // 'score' | 'name' | 'rating' | 'reviews'
  const [loading, setLoading] = useState(true)

  useEffect(() => { reload() }, [])

  async function reload() {
    setLoading(true)
    try {
      const [leadsData, statsData] = await Promise.all([getLeads(), getStats()])
      setLeads(leadsData)
      setStats(statsData)
    } catch {}
    finally { setLoading(false) }
  }

  async function handleDelete(id) {
    if (!confirm('Remove this lead?')) return
    const lead = leads.find(l => l.id === id)
    try {
      await apiDeleteLead(id)
      // Also delete the lead's folder
      const slug = lead?.slug || toSlug(lead?.name)
      if (slug) deleteLeadFolder(slug).catch(() => {})
      reload()
      if (drawer?.id === id) setDrawer(null)
    } catch {}
  }

  const filtered = leads
    .filter(l => !stage || l.stage === stage)
    .filter(l => !search ||
      l.name?.toLowerCase().includes(search.toLowerCase()) ||
      l.neighborhood?.toLowerCase().includes(search.toLowerCase()) ||
      l.category?.toLowerCase().includes(search.toLowerCase()) ||
      l.email?.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === 'score') return scoreLead(b) - scoreLead(a)
      if (sortBy === 'rating') return (b.rating || 0) - (a.rating || 0)
      if (sortBy === 'reviews') return (b.reviewCount || 0) - (a.reviewCount || 0)
      if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '')
      return 0
    })

  // Group by category (title-cased)
  const grouped = {}
  if (groupBy === 'category') {
    for (const lead of filtered) {
      let cat = (lead.category || 'other').replace(/\b\w/g, c => c.toUpperCase())
      if (cat === 'Guesthouses') cat = 'Hotels'
      if (!grouped[cat]) grouped[cat] = []
      grouped[cat].push(lead)
    }
  }
  const sortedCategories = Object.keys(grouped).sort((a, b) => {
    if (sortBy === 'score') {
      const avgA = grouped[a].reduce((s,l) => s + scoreLead(l), 0) / grouped[a].length
      const avgB = grouped[b].reduce((s,l) => s + scoreLead(l), 0) / grouped[b].length
      return avgB - avgA
    }
    return grouped[b].length - grouped[a].length
  })

  // Sort leads within each group
  for (const cat of sortedCategories) {
    grouped[cat].sort((a, b) => {
      if (sortBy === 'score') return scoreLead(b) - scoreLead(a)
      if (sortBy === 'rating') return (b.rating || 0) - (a.rating || 0)
      if (sortBy === 'reviews') return (b.reviewCount || 0) - (a.reviewCount || 0)
      if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '')
      return 0
    })
  }

  function toggleCollapse(cat) {
    setCollapsed(c => ({ ...c, [cat]: !c[cat] }))
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      <PageHeader title="Lead List">
        <Btn onClick={() => exportCsv()}>Export CSV</Btn>
      </PageHeader>

      <div style={{ flex:1, overflowY:'auto', padding:'1.25rem' }}>
        {stats && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12, marginBottom:'1.25rem' }}>
            <Stat label="Total leads" value={stats.total} />
            <Stat label="With email" value={stats.withEmail}
              sub={stats.total ? `${Math.round(stats.withEmail/stats.total*100)}% coverage` : ''} />
            <Stat label="Emailed" value={stats.emailed} />
            <Stat label="Sites built" value={stats.sitesBuilt} />
            <Stat label="Avg rating" value={`${stats.avgRating}★`} />
          </div>
        )}

        <div style={{ display:'flex', gap:'1rem', alignItems:'center', marginBottom:'1rem' }}>
          <div style={{ display:'flex', borderBottom:'1px solid var(--border)', gap:0 }}>
            {STAGES.map(s => (
              <button key={s.label} onClick={()=>setStage(s.key)} style={{
                padding:'6px 14px', fontSize:13, background:'none', border:'none',
                borderBottom: stage===s.key ? '2px solid var(--text)' : '2px solid transparent',
                color: stage===s.key ? 'var(--text)' : 'var(--text2)',
                fontWeight: stage===s.key ? 500 : 400, cursor:'pointer', marginBottom:-1
              }}>{s.label}</button>
            ))}
          </div>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Search name, location, email..." style={{ maxWidth:240 }} />
          <button onClick={() => setGroupBy(g => g === 'none' ? 'category' : 'none')} style={{
            padding:'5px 12px', fontSize:12, borderRadius:'var(--r)',
            border:'1px solid var(--border2)', cursor:'pointer', fontWeight:500,
            background: groupBy === 'category' ? 'var(--accent)' : 'var(--surface)',
            color: groupBy === 'category' ? '#fff' : 'var(--text2)',
            whiteSpace:'nowrap', marginLeft:'auto'
          }}>
            {groupBy === 'category' ? '📂 Grouped' : '📂 Group by type'}
          </button>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{
            padding:'5px 8px', fontSize:12, borderRadius:'var(--r)',
            border:'1px solid var(--border2)', background:'var(--surface)',
            color:'var(--text2)', cursor:'pointer'
          }}>
            <option value="score">Sort: Score ↓</option>
            <option value="reviews">Sort: Reviews ↓</option>
            <option value="rating">Sort: Rating ↓</option>
            <option value="name">Sort: Name A-Z</option>
          </select>
        </div>

        {loading
          ? <Card style={{ textAlign:'center', padding:'3rem' }}>
              <Spinner size={28}/>
              <div style={{ marginTop:'1rem', fontSize:13, color:'var(--text2)' }}>Loading leads...</div>
            </Card>
          : filtered.length === 0
          ? <Card style={{ textAlign:'center', padding:'3rem', color:'var(--text2)' }}>
              <div style={{ fontSize:24, marginBottom:8 }}>📋</div>
              <div>{search || stage ? 'No leads match your filters.' : 'No leads yet — run a search to start.'}</div>
            </Card>
          : groupBy === 'category'
            ? <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
                {sortedCategories.map(cat => (
                  <Card key={cat} p="0" style={{ overflow:'hidden' }}>
                    <button onClick={() => toggleCollapse(cat)} style={{
                      width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between',
                      padding:'10px 14px', background:'var(--surface2)', border:'none',
                      borderBottom: collapsed[cat] ? 'none' : '1px solid var(--border)',
                      cursor:'pointer', textAlign:'left'
                    }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontSize:11, color:'var(--text3)', transition:'transform 0.15s',
                          transform: collapsed[cat] ? 'rotate(-90deg)' : 'rotate(0deg)', display:'inline-block' }}>▼</span>
                        <span style={{ fontWeight:600, fontSize:13 }}>{cat}</span>
                        <Badge color="gray">{grouped[cat].length}</Badge>
                      </div>
                      <div style={{ display:'flex', gap:8, fontSize:11, color:'var(--text3)' }}>
                        <span>📧 {grouped[cat].filter(l=>l.email).length}</span>
                        <span>★ {(grouped[cat].reduce((s,l)=>s+(l.rating||0),0)/grouped[cat].length).toFixed(1)}</span>
                        <span>Score: {Math.round(grouped[cat].reduce((s,l)=>s+scoreLead(l),0)/grouped[cat].length)}</span>
                      </div>
                    </button>
                    {!collapsed[cat] && (
                      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                        <tbody>
                          {grouped[cat].map(lead => (
                            <LeadRow key={lead.id} lead={lead} onOpen={setDrawer} onDelete={handleDelete} />
                          ))}
                        </tbody>
                      </table>
                    )}
                  </Card>
                ))}
              </div>
            : <Card p="0" style={{ overflow:'hidden' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid var(--border)' }}>
                    {['Business','Location','Rating','Score','Contact','Stage',''].map(h =>
                      <th key={h} style={{ padding:'9px 14px', textAlign:'left', fontSize:11, fontWeight:500, color:'var(--text2)' }}>{h}</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(lead => (
                    <LeadRow key={lead.id} lead={lead} onOpen={setDrawer} onDelete={handleDelete} />
                  ))}
                </tbody>
              </table>
            </Card>
        }
      </div>

      {drawer && (
        <LeadDrawer lead={drawer} toast={toast}
          onClose={()=>setDrawer(null)}
          onUpdate={updated=>{ setDrawer(updated); reload() }}
        />
      )}
    </div>
  )
}

function LeadRow({ lead, onOpen, onDelete }) {
  const score = scoreLead(lead)
  const scoreColor = score >= 110 ? 'green' : score >= 85 ? 'blue' : score >= 65 ? 'amber' : 'gray'
  return (
    <tr onClick={() => onOpen(lead)} style={{ borderBottom:'1px solid var(--border)', cursor:'pointer' }}
      onMouseEnter={e => e.currentTarget.style.background='var(--surface2)'}
      onMouseLeave={e => e.currentTarget.style.background=''}>
      <td style={{ padding:'10px 14px' }}>
        <div style={{ fontWeight:500 }}>{lead.name}</div>
        <div style={{ fontSize:11, color:'var(--text3)' }}>{lead.category}</div>
      </td>
      <td style={{ padding:'10px 14px', fontSize:12, color:'var(--text2)' }}>{lead.neighborhood}</td>
      <td style={{ padding:'10px 14px' }}>
        <Stars r={lead.rating}/>
        <span style={{ fontSize:11, color:'var(--text3)', marginLeft:4 }}>({lead.reviewCount})</span>
      </td>
      <td style={{ padding:'10px 14px' }}><Badge color={scoreColor}>{score}</Badge></td>
      <td style={{ padding:'10px 14px' }}><ContactBadge lead={lead}/></td>
      <td style={{ padding:'10px 14px' }}><StageBadge stage={lead.stage}/></td>
      <td style={{ padding:'10px 14px' }} onClick={e => e.stopPropagation()}>
        <div style={{ display:'flex', gap:4 }}>
          <a href={lead.googleMapsUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
            style={{ fontSize:11, padding:'4px 8px', borderRadius:'var(--r)', border:'1px solid var(--border2)',
              background:'var(--surface)', color:'var(--text2)', textDecoration:'none', display:'inline-flex', alignItems:'center' }}
            title="Open in Google Maps">🗺️</a>
          <a href={`https://www.google.com/search?q=${encodeURIComponent(lead.name)}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
            style={{ fontSize:11, padding:'4px 8px', borderRadius:'var(--r)', border:'1px solid var(--border2)',
              background:'var(--surface)', color:'var(--text2)', textDecoration:'none', display:'inline-flex', alignItems:'center' }}
            title="Google search">🔍</a>
          <Btn sm variant="danger" onClick={() => onDelete(lead.id)}>✕</Btn>
        </div>
      </td>
    </tr>
  )
}
