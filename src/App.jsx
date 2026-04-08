import { useState, useEffect } from 'react'
import { ConfigBanner, ToastContainer, useToast } from './components/ui'
import SearchPage  from './pages/SearchPage'
import LeadsPage   from './pages/LeadsPage'
import EmailPage   from './pages/EmailPage'
import BriefPage   from './pages/BriefPage'
import SettingsPage from './pages/SettingsPage'
import AssetsPage  from './pages/AssetsPage'
import LoginPage   from './pages/LoginPage'
import { getMe, logout as apiLogout } from './lib/api'

const NAV = [
  { id:'search',   icon:'🔍', label:'Lead Search',      group:'Discover' },
  { id:'leads',    icon:'📋', label:'Lead List',         group:'Discover' },
  { id:'email',    icon:'✉️',  label:'Email Templates',   group:'Outreach' },
  { id:'brief',    icon:'📝', label:'Kiro Brief',        group:'Build' },
  { id:'assets',   icon:'📦', label:'Assets Library',    group:'Build' },
  { id:'settings', icon:'⚙️', label:'Settings',          group:'Config' },
]

const PAGES = { search: SearchPage, leads: LeadsPage, email: EmailPage, brief: BriefPage, assets: AssetsPage, settings: SettingsPage }

export default function App() {
  const [active, setActive] = useState('search')
  const { toasts, toast } = useToast()
  // null = still checking, false = unauthenticated, object = authenticated user
  const [user, setUser] = useState(null)

  useEffect(() => {
    getMe()
      .then(u => setUser(u))
      .catch(() => setUser(false))
  }, [])

  async function handleLogout() {
    try { await apiLogout() } catch {}
    setUser(false)
  }

  // Loading state while checking auth
  if (user === null) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: 'var(--bg)', color: 'var(--text2)', fontSize: 14,
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>⚡</div>
          <div>Loading…</div>
        </div>
      </div>
    )
  }

  // Unauthenticated → show login
  if (user === false) {
    return <LoginPage onLogin={setUser} />
  }

  // Authenticated → show app
  const groups = [...new Set(NAV.map(n => n.group))]
  const Page = PAGES[active]

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden' }}>
      {/* Sidebar */}
      <aside style={{ width:208, minWidth:208, background:'var(--surface)',
        borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', padding:'1.25rem 0' }}>
        <div style={{ padding:'0 1.25rem 1.25rem', borderBottom:'1px solid var(--border)', marginBottom:'1rem' }}>
          <div style={{ fontWeight:600, fontSize:15, letterSpacing:'-0.02em' }}>⚡ LeadsForger</div>
          <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>Website sales engine</div>
        </div>

        {groups.map(g => (
          <div key={g}>
            <div style={{ padding:'0.75rem 1.25rem 0.25rem', fontSize:10, letterSpacing:'0.08em',
              textTransform:'uppercase', color:'var(--text3)' }}>{g}</div>
            {NAV.filter(n => n.group === g).map(item => (
              <button key={item.id} onClick={() => setActive(item.id)} style={{
                display:'flex', alignItems:'center', gap:9, width:'100%',
                padding:'8px 1.25rem', background: active===item.id ? 'var(--surface2)' : 'transparent',
                color: active===item.id ? 'var(--text)' : 'var(--text2)',
                fontWeight: active===item.id ? 500 : 400,
                borderLeft: active===item.id ? '2px solid var(--text)' : '2px solid transparent',
                border:'none', borderRadius:0, textAlign:'left', fontSize:13, cursor:'pointer'
              }}>
                <span style={{ fontSize:14 }}>{item.icon}</span>{item.label}
              </button>
            ))}
          </div>
        ))}

        {/* Logout at bottom */}
        <div style={{ marginTop:'auto', padding:'0.75rem 1.25rem', borderTop:'1px solid var(--border)' }}>
          <div style={{ fontSize:11, color:'var(--text3)', marginBottom:6 }}>
            {user.displayName || user.display_name || user.username}
          </div>
          <button onClick={handleLogout} style={{
            display:'flex', alignItems:'center', gap:6, width:'100%',
            padding:'6px 0', background:'transparent', border:'none',
            color:'var(--text3)', fontSize:12, cursor:'pointer', textAlign:'left',
          }}>
            🚪 Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
        <ConfigBanner />
        <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
          <Page onNavigate={setActive} toast={toast} user={user} />
        </div>
      </div>

      <ToastContainer toasts={toasts} />
    </div>
  )
}
