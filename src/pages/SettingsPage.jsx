import { useState } from 'react'
import { testSmtp, exportBackup, importBackup, getLeads } from '../lib/api'
import { Btn, Card, PageHeader, Spinner } from '../components/ui'

export default function SettingsPage({ toast }) {
  const [testingSmtp, setTestingSmtp] = useState(false)
  const [restoring, setRestoring] = useState(false)

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
