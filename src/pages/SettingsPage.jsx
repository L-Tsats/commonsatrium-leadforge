import { useState, useEffect } from 'react'
import { testSmtp, exportBackup, importBackup, getLeads, getApiCosts, resetApiCosts, migrateLeadFolders } from '../lib/api'
import { Btn, Card, PageHeader, Spinner } from '../components/ui'

export default function SettingsPage({ toast, user }) {
  const [testingSmtp, setTestingSmtp] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [costs, setCosts] = useState(null)
  const [migrating, setMigrating] = useState(false)
  const [newUser, setNewUser] = useState({ username:'', password:'', displayName:'' })
  const [creatingUser, setCreatingUser] = useState(false)

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
                Month: {costs.resetDate || 'N/A'} · Free credit: $200/mo · Set budget in Search page
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
            <p style={{ marginBottom:8 }}>All leads are stored in your browser's <b>localStorage</b> — no database, no server, nothing to back up externally. They persist across restarts automatically.</p>
            <p style={{ marginBottom:8 }}>Screenshots are saved to the <code style={{ fontFamily:'var(--mono)', fontSize:11 }}>screenshots/</code> folder in your project.</p>
            <p>To back up your leads: use the <b>Export CSV</b> button on the Lead List page.</p>
          </div>
        </Card>

        {/* User Management — admin only */}
        {user?.username === 'admin' && (
          <Card>
            <div style={{ fontWeight:500, marginBottom:'1rem' }}>User Management</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:'1rem' }}>
              <div>
                <label style={{ fontSize:11, color:'var(--text2)', display:'block', marginBottom:4 }}>Name (used as username and display name)</label>
                <input value={newUser.displayName} onChange={e => setNewUser({ username: e.target.value.toLowerCase().replace(/[^a-z0-9]/g,''), password: newUser.password, displayName: e.target.value })}
                  placeholder="e.g. Maria" style={{ width:'100%', fontSize:13 }} />
              </div>
              <div>
                <label style={{ fontSize:11, color:'var(--text2)', display:'block', marginBottom:4 }}>Password</label>
                <input value={newUser.password} onChange={e => setNewUser(u => ({...u, password:e.target.value}))}
                  placeholder="Password" style={{ width:'100%', fontSize:13 }} />
              </div>
              {newUser.displayName && (
                <div style={{ fontSize:11, color:'var(--text3)' }}>
                  Username will be: <code style={{ fontFamily:'var(--mono)' }}>{newUser.displayName.toLowerCase().replace(/[^a-z0-9]/g,'')}</code>
                </div>
              )}
              <Btn onClick={async () => {
                const username = newUser.displayName.toLowerCase().replace(/[^a-z0-9]/g,'')
                if (!username || !newUser.password) { toast('Name and password required', 'error'); return }
                setCreatingUser(true)
                try {
                  const r = await fetch('/api/auth/register', {
                    method:'POST', headers:{'Content-Type':'application/json'},
                    body: JSON.stringify({ username, password: newUser.password, displayName: newUser.displayName })
                  })
                  const data = await r.json()
                  if (!r.ok) throw new Error(data.error)
                  toast(`✓ User "${username}" created`)
                  setNewUser({ username:'', password:'', displayName:'' })
                } catch (e) { toast(e.message, 'error') }
                finally { setCreatingUser(false) }
              }} disabled={creatingUser} style={{ width:'100%' }}>
                {creatingUser ? <><Spinner size={12}/> Creating...</> : '+ Create user'}
              </Btn>
            </div>
          </Card>
        )}
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
