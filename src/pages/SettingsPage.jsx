import { useState, useEffect } from 'react'
import { testSmtp, exportBackup, importBackup, getLeads, getApiCosts, resetApiCosts, migrateLeadFolders, getSearchLog } from '../lib/api'
import { Btn, Card, PageHeader, Spinner } from '../components/ui'

export default function SettingsPage({ toast, user }) {
  const [testingSmtp, setTestingSmtp] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [costs, setCosts] = useState(null)
  const [migrating, setMigrating] = useState(false)
  const [newUser, setNewUser] = useState({ username:'', password:'', displayName:'' })
  const [creatingUser, setCreatingUser] = useState(false)
  const [userList, setUserList] = useState([])
  const [searchLog, setSearchLog] = useState([])

  useEffect(() => { loadCosts(); if (user?.username === 'admin') { loadUsers(); loadLog() } }, [])

  async function loadUsers() {
    try {
      const r = await fetch('/api/auth/users')
      const data = await r.json()
      setUserList(data.users || [])
    } catch {}
  }

  async function loadLog() {
    try {
      const data = await getSearchLog()
      setSearchLog(data.log || [])
    } catch {}
  }

  function generatePassword() {
    const words = ['blue','red','fast','cool','star','moon','sun','fire','wave','rock','gold','mint']
    const w = words[Math.floor(Math.random()*words.length)]
    const n = Math.floor(Math.random()*900)+100
    return w + n
  }

  useEffect(() => { loadCosts() }, [])

  async function loadCosts() {
    try { setCosts(await getApiCosts()) } catch {}
  }

  async function doTestSmtp() {
    setTestingSmtp(true)
    try { await testSmtp(); toast('✓ SMTP connected!') }
    catch (e) { toast(e.message, 'error') }
    finally { setTestingSmtp(false) }
  }

  async function doRestore() {
    setRestoring(true)
    try {
      const { leads } = await exportBackup()
      if (leads?.length) {
        await importBackup(leads)
        toast(`✓ Restored ${leads.length} leads from backup`)
      } else {
        toast('No backup found', 'error')
      }
    } catch (e) { toast(e.message, 'error') }
    finally { setRestoring(false) }
  }

  async function doBackupNow() {
    try {
      const leads = await getLeads()
      await importBackup(leads)
      toast(`✓ Backed up ${leads.length} leads`)
    } catch (e) { toast(e.message, 'error') }
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      <PageHeader title="Settings" />
      <div style={{ flex:1, overflowY:'auto', padding:'1.25rem', display:'flex', flexDirection:'column', gap:'1.25rem', maxWidth:660 }}>

        {/* API Cost Tracker */}
        <Card>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.25rem' }}>
            <div style={{ fontWeight:500 }}>Google Places API Costs (this month)</div>
            <div style={{ display:'flex', gap:8 }}>
              <Btn sm onClick={loadCosts}>↻ Refresh</Btn>
              <Btn sm variant="danger" onClick={async () => {
                if (!confirm('Reset cost counter? This only resets the tracker, not your actual Google bill.')) return
                await resetApiCosts(); loadCosts(); toast('Cost counter reset')
              }}>Reset</Btn>
            </div>
          </div>
          {costs ? (
            <div>
              <div style={{ fontSize:28, fontWeight:600, marginBottom:8 }}>${costs.total?.toFixed(2) || '0.00'}</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:'1rem' }}>
                <div style={{ background:'var(--surface2)', padding:'8px 12px', borderRadius:'var(--r)' }}>
                  <div style={{ fontSize:11, color:'var(--text3)' }}>Text Searches</div>
                  <div style={{ fontSize:16, fontWeight:600 }}>{costs.calls?.textSearch || 0}</div>
                  <div style={{ fontSize:11, color:'var(--text3)' }}>${costs.breakdown?.textSearch?.toFixed(3) || '0'}</div>
                </div>
                <div style={{ background:'var(--surface2)', padding:'8px 12px', borderRadius:'var(--r)' }}>
                  <div style={{ fontSize:11, color:'var(--text3)' }}>Place Details</div>
                  <div style={{ fontSize:16, fontWeight:600 }}>{costs.calls?.placeDetails || 0}</div>
                  <div style={{ fontSize:11, color:'var(--text3)' }}>${costs.breakdown?.placeDetails?.toFixed(3) || '0'}</div>
                </div>
                <div style={{ background:'var(--surface2)', padding:'8px 12px', borderRadius:'var(--r)' }}>
                  <div style={{ fontSize:11, color:'var(--text3)' }}>Photo Downloads</div>
                  <div style={{ fontSize:16, fontWeight:600 }}>{costs.calls?.placePhoto || 0}</div>
                  <div style={{ fontSize:11, color:'var(--text3)' }}>${costs.breakdown?.placePhoto?.toFixed(3) || '0'}</div>
                </div>
              </div>
              <div style={{ fontSize:11, color:'var(--text3)' }}>
                Month: {costs.resetDate || 'N/A'} · Free credit: $200/mo
              </div>
              <div style={{ display:'flex', gap:8, alignItems:'center', marginTop:8 }}>
                <label style={{ fontSize:11, color:'var(--text2)' }}>Budget limit: $</label>
                <input type="number" defaultValue={costs.budget || 280} style={{ width:80, fontSize:12 }}
                  onBlur={async e => {
                    const val = parseFloat(e.target.value)
                    if (isNaN(val) || val < 0) return
                    try {
                      await fetch('/api/costs/budget', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ budget:val }) })
                      toast(`✓ Budget set to $${val}`)
                    } catch (err) { toast(err.message, 'error') }
                  }} />
                <span style={{ fontSize:10, color:'var(--text3)' }}>Search stops when this is reached</span>
              </div>
            </div>
          ) : (
            <div style={{ fontSize:12, color:'var(--text3)' }}>Loading costs...</div>
          )}
        </Card>

        {/* Folder Migration */}
        <Card>
          <div style={{ fontWeight:500, marginBottom:'0.75rem' }}>Fix Lead Folders</div>
          <div style={{ fontSize:12, color:'var(--text2)', lineHeight:1.6, marginBottom:'1rem' }}>
            Recreates all lead folders with proper slugs (fixes Greek names and broken folders). Moves existing photos/assets to the new folders. No API calls — just file management.
          </div>
          <Btn onClick={async () => {
            if (!confirm('This will recreate all lead folders. Existing photos will be moved. Continue?')) return
            setMigrating(true)
            try {
              const leadsData = await getLeads()
              const leads = (leadsData.leads || leadsData || []).map(l => ({ name: l.name, oldSlug: l.slug }))
              const result = await migrateLeadFolders(leads)
              if (result) toast(`✓ Done: ${result.created} created, ${result.migrated} migrated, ${result.skipped} unchanged`)
              else toast('Migration completed')
            } catch (e) { toast(e.message, 'error') }
            finally { setMigrating(false) }
          }} disabled={migrating}>
            {migrating ? <><Spinner size={12}/> Migrating folders...</> : '🔧 Fix all lead folders'}
          </Btn>
        </Card>

        <Card>
          <div style={{ fontWeight:500, marginBottom:'1.25rem' }}>Configuration</div>
          <div style={{ fontSize:12, background:'var(--surface2)', padding:'10px 14px',
            borderRadius:'var(--r)', color:'var(--text2)', lineHeight:1.7, marginBottom:'1.25rem' }}>
            All settings live in your <code style={{ fontFamily:'var(--mono)', fontSize:11 }}>.env</code> file in the project root.
            Edit it with any text editor, then <b>restart the app</b> (<code style={{ fontFamily:'var(--mono)', fontSize:11 }}>Ctrl+C</code> then <code style={{ fontFamily:'var(--mono)', fontSize:11 }}>npm start</code>) for changes to take effect.
            Or run <code style={{ fontFamily:'var(--mono)', fontSize:11 }}>npm run setup</code> again to re-enter all values interactively.
          </div>

          <div style={{ display:'grid', gap:'1rem' }}>
            <SettingRow title="SMTP connection" hint="Test whether your email credentials are working correctly.">
              <Btn onClick={doTestSmtp} disabled={testingSmtp}>
                {testingSmtp ? <><Spinner size={12}/> Testing...</> : 'Test SMTP'}
              </Btn>
            </SettingRow>
            <SettingRow title="Backup leads" hint="Leads auto-backup to data/leads-backup.json on every change. You can also trigger it manually.">
              <div style={{ display:'flex', gap:8 }}>
                <Btn onClick={doBackupNow}>💾 Backup now</Btn>
                <Btn onClick={doRestore} disabled={restoring}>
                  {restoring ? <><Spinner size={12}/> Restoring...</> : '📥 Restore from backup'}
                </Btn>
              </div>
            </SettingRow>
          </div>
        </Card>

        <Card>
          <div style={{ fontWeight:500, marginBottom:'1.25rem' }}>Getting your API keys</div>
          {[
            {
              title: 'Google Places API',
              url: 'https://console.cloud.google.com',
              steps: [
                'Go to console.cloud.google.com',
                'Create or select a project',
                'Search for "Places API" and enable it (the legacy one, not "Places API (New)")',
                'Go to Credentials → Create API Key',
                'Copy the key into your .env as GOOGLE_PLACES_API_KEY',
                'Free tier: $200/month credit — enough for thousands of searches'
              ]
            },
            {
              title: 'Anthropic (Claude)',
              url: 'https://console.anthropic.com/settings/billing',
              steps: [
                'Sign up at console.anthropic.com',
                'Go to Settings → API Keys → create one',
                'Add credits in Settings → Billing',
                'Used for: photo analysis and AI contact search'
              ]
            },
            {
              title: 'SMTP — Gmail',
              url: 'https://myaccount.google.com/security',
              steps: [
                'Enable 2-factor auth on your Google account',
                'Go to myaccount.google.com → Security → App Passwords',
                'Create an App Password for "Mail"',
                'Use: host=smtp.gmail.com, port=587, user=your@gmail.com, pass=the 16-char app password',
                'Limit: 500 emails/day on free Gmail'
              ]
            }
          ].map(({ title, url, steps }) => (
            <div key={title} style={{ marginBottom:'1.5rem', paddingBottom:'1.5rem', borderBottom:'1px solid var(--border)' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.5rem' }}>
                <div style={{ fontWeight:500, fontSize:13 }}>{title}</div>
                <a href={url} target="_blank" rel="noreferrer" style={{ fontSize:12, color:'var(--blue)' }}>Get key →</a>
              </div>
              <ol style={{ paddingLeft:'1.25rem', color:'var(--text2)', fontSize:12, lineHeight:1.8 }}>
                {steps.map((s,i) => <li key={i}>{s}</li>)}
              </ol>
            </div>
          ))}
        </Card>

        <Card>
          <div style={{ fontWeight:500, marginBottom:'1rem' }}>Data storage</div>
          <div style={{ fontSize:12, color:'var(--text2)', lineHeight:1.7 }}>
            <p style={{ marginBottom:8 }}>All leads, templates, assets, users, and email queue are stored in the <b>MariaDB database</b> on the server. Data persists across restarts and is shared across all users.</p>
            <p style={{ marginBottom:8 }}>Photos and site files are stored on the server filesystem in the <code style={{ fontFamily:'var(--mono)', fontSize:11 }}>sites/</code> directory.</p>
            <p>API cost tracking and search logs are stored in <code style={{ fontFamily:'var(--mono)', fontSize:11 }}>data/</code> as JSON files.</p>
          </div>
        </Card>

        {/* User Management — admin only */}
        {user?.username === 'admin' && (<>
          <Card>
            <div style={{ fontWeight:500, marginBottom:'1rem' }}>User Management</div>

            {/* User list */}
            {userList.length > 0 && (
              <div style={{ marginBottom:'1rem' }}>
                <div style={{ fontSize:11, color:'var(--text3)', marginBottom:6 }}>Existing users ({userList.length})</div>
                {userList.map(u => (
                  <div key={u.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                    padding:'6px 8px', background:'var(--surface2)', borderRadius:'var(--r)', marginBottom:4, fontSize:12 }}>
                    <div>
                      <span style={{ fontWeight:500 }}>{u.display_name || u.username}</span>
                      <span style={{ color:'var(--text3)', marginLeft:6 }}>@{u.username}</span>
                      {u.plain_password && <span style={{ color:'var(--text3)', marginLeft:6, fontFamily:'var(--mono)', fontSize:11 }}>pw: {u.plain_password}</span>}
                    </div>
                    <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                      <span style={{ fontSize:10, color:'var(--text3)' }}>{u.created_at ? new Date(u.created_at).toLocaleDateString('el-GR') : ''}</span>
                      {u.username !== 'admin' && (
                        <button onClick={async () => {
                          if (!confirm(`Delete user "${u.username}"?`)) return
                          try {
                            const r = await fetch(`/api/auth/users/${u.username}`, { method:'DELETE' })
                            const data = await r.json()
                            if (!r.ok) throw new Error(data.error)
                            toast(`✓ User "${u.username}" deleted`)
                            loadUsers()
                          } catch (e) { toast(e.message, 'error') }
                        }} style={{ fontSize:10, color:'var(--red)', background:'none', border:'none', cursor:'pointer' }}>✕</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Create new user */}
            <div style={{ fontSize:11, color:'var(--text3)', marginBottom:6 }}>Create new user</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:'1rem' }}>
              <div>
                <label style={{ fontSize:11, color:'var(--text2)', display:'block', marginBottom:4 }}>Name</label>
                <input value={newUser.displayName} onChange={e => {
                  const name = e.target.value
                  const pw = newUser.password || generatePassword()
                  setNewUser({ username: name.toLowerCase().replace(/[^a-z0-9]/g,''), password: pw, displayName: name })
                }}
                  placeholder="e.g. Maria" style={{ width:'100%', fontSize:13 }} />
              </div>
              {newUser.displayName && (
                <div style={{ background:'var(--surface2)', padding:'8px 12px', borderRadius:'var(--r)', fontSize:12 }}>
                  <div>Username: <code style={{ fontFamily:'var(--mono)' }}>{newUser.displayName.toLowerCase().replace(/[^a-z0-9]/g,'')}</code></div>
                  <div>Password: <code style={{ fontFamily:'var(--mono)' }}>{newUser.password}</code>
                    <button onClick={() => setNewUser(u => ({...u, password: generatePassword()}))} style={{
                      marginLeft:8, fontSize:10, color:'var(--blue)', background:'none', border:'none', cursor:'pointer'
                    }}>↻ regenerate</button>
                  </div>
                </div>
              )}
              <Btn onClick={async () => {
                const username = newUser.displayName.toLowerCase().replace(/[^a-z0-9]/g,'')
                if (!username || !newUser.password) { toast('Enter a name first', 'error'); return }
                setCreatingUser(true)
                try {
                  const r = await fetch('/api/auth/register', {
                    method:'POST', headers:{'Content-Type':'application/json'},
                    body: JSON.stringify({ username, password: newUser.password, displayName: newUser.displayName })
                  })
                  const data = await r.json()
                  if (!r.ok) throw new Error(data.error)
                  toast(`✓ User "${username}" created — password: ${newUser.password}`)
                  setNewUser({ username:'', password:'', displayName:'' })
                  loadUsers()
                } catch (e) { toast(e.message, 'error') }
                finally { setCreatingUser(false) }
              }} disabled={creatingUser} style={{ width:'100%' }}>
                {creatingUser ? <><Spinner size={12}/> Creating...</> : '+ Create user'}
              </Btn>
            </div>
          </Card>

          {/* Search & Activity Log */}
          <Card>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
              <div style={{ fontWeight:500 }}>Activity Log</div>
              <Btn sm onClick={loadLog}>↻ Refresh</Btn>
            </div>
            {searchLog.length === 0 ? (
              <div style={{ fontSize:12, color:'var(--text3)', padding:'1rem 0', textAlign:'center' }}>No activity logged yet.</div>
            ) : (
              <div style={{ maxHeight:300, overflowY:'auto', display:'flex', flexDirection:'column', gap:3 }}>
                {[...searchLog].reverse().map((entry, i) => (
                  <div key={i} style={{ padding:'6px 8px', background:'var(--surface2)', borderRadius:'var(--r)', fontSize:11 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', gap:8 }}>
                      <span style={{ fontWeight:500 }}>
                        {entry.action === 'USER_BLOCKED' ? '🚫 ' : ''}
                        {entry.action || entry.query || 'search'}
                      </span>
                      <span style={{ color:'var(--text3)', flexShrink:0 }}>
                        {entry.timestamp ? new Date(entry.timestamp).toLocaleString('el-GR') : ''}
                      </span>
                    </div>
                    {entry.username && <div style={{ color:'var(--text3)' }}>User: {entry.username}</div>}
                    {entry.reason && <div style={{ color:'var(--red)' }}>{entry.reason}</div>}
                    {entry.apiKey && <div style={{ fontSize:10, color:'var(--text3)', fontFamily:'var(--mono)' }}>API key: {entry.apiKey}</div>}
                    {entry.totalAtBlock != null && <div style={{ fontSize:10, color:'var(--text3)' }}>Total spent at block: ${entry.totalAtBlock?.toFixed(2)}</div>}
                    {entry.location && <div style={{ color:'var(--text3)' }}>{entry.location} → {entry.category}</div>}
                    {entry.leadsFound != null && <div style={{ color:'var(--text3)' }}>Found: {entry.leadsFound} leads · Cost: ${entry.cost?.toFixed(3) || '?'}</div>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>)}
      </div>
    </div>
  )
}

function SettingRow({ title, hint, children }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start',
      padding:'12px 0', borderBottom:'1px solid var(--border)' }}>
      <div>
        <div style={{ fontSize:13, fontWeight:500 }}>{title}</div>
        {hint && <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>{hint}</div>}
      </div>
      <div style={{ marginLeft:'1rem' }}>{children}</div>
    </div>
  )
}
