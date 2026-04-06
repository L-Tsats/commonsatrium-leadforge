import { useState, useEffect } from 'react'
import { Btn, Card, Badge, Spinner } from './ui'
import { generateDomainSuggestions, normalizeDomain } from '../lib/domains'
import { checkDomains, suggestDomains } from '../lib/api'

export default function DomainsTab({ lead, onSave, toast }) {
  const [domains, setDomains] = useState(() => generateDomainSuggestions(lead.name))
  const [results, setResults] = useState(lead.domainResults || null)
  const [checking, setChecking] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [error, setError] = useState(null)

  // Re-populate suggestions when lead changes
  useEffect(() => {
    setDomains(generateDomainSuggestions(lead.name))
    setResults(lead.domainResults || null)
  }, [lead.id])

  function updateDomain(i, value) {
    setDomains(d => d.map((v, j) => j === i ? value : v))
  }

  function removeDomain(i) {
    setDomains(d => d.filter((_, j) => j !== i))
  }

  function addDomain() {
    setDomains(d => [...d, ''])
  }

  async function handleAISuggest() {
    setSuggesting(true)
    try {
      const data = await suggestDomains(lead.name, lead.category, lead.neighborhood)
      const newSuggestions = (data.suggestions || []).filter(s => !domains.includes(s))
      if (newSuggestions.length) {
        setDomains(d => [...d, ...newSuggestions])
        toast?.(`✓ Added ${newSuggestions.length} AI suggestions`)
      } else {
        toast?.('No new suggestions found', 'error')
      }
    } catch (e) {
      toast?.('AI suggest failed: ' + (e.message || 'Unknown error'), 'error')
    } finally {
      setSuggesting(false)
    }
  }

  async function handleCheck() {
    const normalized = domains.map(d => normalizeDomain(d)).filter(Boolean)
    if (!normalized.length) return
    setChecking(true)
    setError(null)
    try {
      const data = await checkDomains(normalized)
      const res = data.results || []
      setResults(res)
      const ts = new Date().toISOString()
      onSave({ domainResults: res, domainCheckedAt: ts })
    } catch (e) {
      setError(e.message || 'Domain check failed')
      toast?.('Domain check failed: ' + (e.message || 'Unknown error'), 'error')
    } finally {
      setChecking(false)
    }
  }

  // Summary computation
  const available = results ? results.filter(r => r.available === true) : []
  const cheapest = available.length
    ? Math.min(...available.filter(r => r.price != null).map(r => r.price))
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* Previous results banner */}
      {results && lead.domainCheckedAt && !checking && (
        <div style={{ fontSize: 11, color: 'var(--text3)' }}>
          Last checked: {new Date(lead.domainCheckedAt).toLocaleString()}
        </div>
      )}

      {/* Domain input list */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8, color: 'var(--text2)' }}>
          Domains to check
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {domains.map((d, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                value={d}
                onChange={e => updateDomain(i, e.target.value)}
                placeholder="example.gr"
                style={{
                  flex: 1, padding: '6px 10px', fontSize: 13,
                  background: 'var(--surface2)', border: '1px solid var(--border2)',
                  borderRadius: 'var(--r)', color: 'var(--text)', outline: 'none'
                }}
              />
              <Btn sm variant="ghost" onClick={() => removeDomain(i)} style={{ color: 'var(--red)', padding: '4px 8px' }}>✕</Btn>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
          <Btn sm onClick={addDomain}>+ Add domain</Btn>
          <Btn sm onClick={handleAISuggest} disabled={suggesting}>
            {suggesting ? <><Spinner size={12} /> Suggesting…</> : '🤖 AI Suggest'}
          </Btn>
          <Btn sm variant="primary" onClick={handleCheck} disabled={checking || !domains.filter(d => d.trim()).length}>
            {checking ? <><Spinner size={12} /> Checking…</> : 'Check Availability'}
          </Btn>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: '8px 12px', background: 'var(--red-bg)', color: 'var(--red)',
          borderRadius: 'var(--r)', fontSize: 12 }}>
          {error}
        </div>
      )}

      {/* Results */}
      {results && results.length > 0 && (
        <div>
          {/* Summary line */}
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10, color: 'var(--text)' }}>
            {available.length} available{cheapest != null && cheapest !== Infinity ? ` · cheapest: €${cheapest.toFixed(2)}` : ''}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {results.map((r, i) => {
              const isAvailable = r.available === true
              const isError = r.available == null && r.error
              const borderColor = isAvailable ? 'var(--green)' : isError ? 'var(--red)' : 'var(--border2)'
              const bgColor = isAvailable ? 'var(--green-bg)' : isError ? 'var(--red-bg)' : 'var(--surface2)'

              return (
                <Card key={i} p="0.75rem" style={{ borderLeft: `3px solid ${borderColor}`, background: bgColor }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{r.domain}</span>
                      {isAvailable && (
                        <Badge color="green" style={{ marginLeft: 8 }}>Available</Badge>
                      )}
                      {!isAvailable && !isError && (
                        <Badge color="gray" style={{ marginLeft: 8 }}>Taken</Badge>
                      )}
                      {isError && (
                        <Badge color="red" style={{ marginLeft: 8 }}>Error</Badge>
                      )}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                      {isAvailable && r.price != null ? `€${r.price.toFixed(2)}` : ''}
                      {isError && <span style={{ fontSize: 11, color: 'var(--red)' }}>{r.error}</span>}
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
