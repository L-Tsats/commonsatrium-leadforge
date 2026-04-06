import { useState, useEffect } from 'react'
import { Btn, Card, Badge, Spinner } from './ui'
import { generateDomainSuggestions, normalizeDomain } from '../lib/domains'
import { suggestDomains } from '../lib/api'

const REGISTRARS = [
  { name: 'Papaki', url: (d) => `https://www.papaki.com/en/domain-search.htm?domain=${d}` },
  { name: 'Tophost', url: (d) => `https://www.tophost.gr/domain-names?search=${d}` },
  { name: 'Namecheap', url: (d) => `https://www.namecheap.com/domains/registration/results/?domain=${d}` },
  { name: 'GoDaddy', url: (d) => `https://www.godaddy.com/domainsearch/find?domainToCheck=${d}` },
  { name: 'Gandi', url: (d) => `https://shop.gandi.net/en/domain/suggest?search=${d.split('.')[0]}` },
]

export default function DomainsTab({ lead, onSave, toast }) {
  const [domains, setDomains] = useState(() =>
    lead.domainWatchlist?.length ? lead.domainWatchlist : generateDomainSuggestions(lead.name)
  )
  const [selected, setSelected] = useState(lead.selectedDomain || null)
  const [suggesting, setSuggesting] = useState(false)

  useEffect(() => {
    setDomains(lead.domainWatchlist?.length ? lead.domainWatchlist : generateDomainSuggestions(lead.name))
    setSelected(lead.selectedDomain || null)
  }, [lead.id])

  // Auto-save watchlist whenever domains change
  useEffect(() => {
    const filtered = domains.filter(d => d.trim())
    if (filtered.length > 0) onSave({ domainWatchlist: filtered })
  }, [domains])

  function updateDomain(i, value) {
    setDomains(d => d.map((v, j) => j === i ? value : v))
  }

  function removeDomain(i) {
    const removed = domains[i]
    setDomains(d => d.filter((_, j) => j !== i))
    if (selected === removed) { setSelected(null); onSave({ selectedDomain: null }) }
  }

  function addDomain() {
    setDomains(d => [...d, ''])
  }

  function selectDomain(domain) {
    const normalized = normalizeDomain(domain)
    setSelected(normalized)
    onSave({ selectedDomain: normalized })
    toast?.(`✓ Selected: ${normalized}`)
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
    } finally { setSuggesting(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* Selected domain banner */}
      {selected && (
        <div style={{ padding: '8px 12px', background: 'var(--green-bg)', color: 'var(--green)',
          borderRadius: 'var(--r)', fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Selected: <strong>{selected}</strong></span>
          <div style={{ display: 'flex', gap: 8 }}>
            {REGISTRARS.map(r => (
              <a key={r.name} href={r.url(selected)} target="_blank" rel="noreferrer"
                style={{ color: 'var(--green)', fontSize: 11, textDecoration: 'underline' }}>{r.name}</a>
            ))}
          </div>
        </div>
      )}

      {/* Domain list */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8, color: 'var(--text2)' }}>
          Domain suggestions
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {domains.map((d, i) => {
            const normalized = d.trim() ? normalizeDomain(d) : ''
            const isSelected = normalized && normalized === selected
            return (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input value={d} onChange={e => updateDomain(i, e.target.value)}
                  placeholder="example.gr"
                  style={{
                    flex: 1, padding: '6px 10px', fontSize: 13,
                    background: isSelected ? 'var(--green-bg)' : 'var(--surface2)',
                    border: isSelected ? '1px solid var(--green)' : '1px solid var(--border2)',
                    borderRadius: 'var(--r)', color: 'var(--text)', outline: 'none'
                  }} />
                <Btn sm onClick={() => d.trim() && selectDomain(d)}
                  style={{ padding: '4px 8px', background: isSelected ? 'var(--green)' : undefined,
                    color: isSelected ? '#fff' : undefined }}>
                  {isSelected ? '✓' : 'Select'}
                </Btn>
                <Btn sm variant="ghost" onClick={() => removeDomain(i)}
                  style={{ color: 'var(--red)', padding: '4px 8px' }}>✕</Btn>
              </div>
            )
          })}
        </div>
        <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
          <Btn sm onClick={addDomain}>+ Add domain</Btn>
          <Btn sm onClick={handleAISuggest} disabled={suggesting}>
            {suggesting ? <><Spinner size={12} /> Suggesting…</> : '🤖 AI Suggest'}
          </Btn>
        </div>
      </div>

      {/* Check prices section — shows for all domains */}
      {domains.filter(d => d.trim()).length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8, color: 'var(--text2)' }}>
            Check prices manually
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {domains.filter(d => d.trim()).map((d, i) => {
              const normalized = normalizeDomain(d)
              const isSelected = normalized === selected
              return (
                <Card key={i} p="0.625rem" style={{
                  borderLeft: isSelected ? '3px solid var(--green)' : '3px solid var(--border2)',
                  background: isSelected ? 'var(--green-bg)' : 'var(--surface2)'
                }}>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{normalized}</div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {REGISTRARS.map(r => (
                      <a key={r.name} href={r.url(normalized)} target="_blank" rel="noreferrer"
                        style={{ fontSize: 11, color: 'var(--blue)', textDecoration: 'none' }}>
                        {r.name} →
                      </a>
                    ))}
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
