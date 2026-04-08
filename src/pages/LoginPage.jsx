import { useState } from 'react'
import { login } from '../lib/api'

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const user = await login(username, password)
      onLogin(user)
    } catch (err) {
      setError(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: 'var(--bg)',
    }}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--rl)', padding: '2.5rem 2rem', width: 360,
        boxShadow: 'var(--sh)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em' }}>⚡ LeadsForger</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>Sign in to continue</div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label htmlFor="lf-user" style={{ fontSize: 11, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>
              Username
            </label>
            <input
              id="lf-user"
              type="text"
              autoComplete="username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="admin"
              required
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label htmlFor="lf-pass" style={{ fontSize: 11, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>
              Password
            </label>
            <input
              id="lf-pass"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <div style={{
              background: 'var(--red-bg)', color: 'var(--red)',
              padding: '8px 12px', borderRadius: 'var(--r)',
              fontSize: 12, marginBottom: 14,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '9px 0', fontSize: 13, fontWeight: 500,
              borderRadius: 'var(--r)', border: '1px solid var(--accent)',
              background: 'var(--accent)', color: '#fff',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1, transition: 'opacity 0.15s',
            }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
