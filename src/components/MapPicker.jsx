// src/components/MapPicker.jsx
// Uses Leaflet (open source, no API key needed) for map display
// Uses OpenStreetMap Nominatim for reverse geocoding (free, no key)

import { useEffect, useRef, useState } from 'react'

// Dynamically load Leaflet from CDN
function loadLeaflet() {
  return new Promise((resolve) => {
    if (window.L) return resolve(window.L)

    const css = document.createElement('link')
    css.rel = 'stylesheet'
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(css)

    const script = document.createElement('script')
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.onload = () => resolve(window.L)
    document.head.appendChild(script)
  })
}

async function reverseGeocode(lat, lng) {
  const r = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=en`,
    { headers: { 'User-Agent': 'LeadForge/1.0' } }
  )
  const data = await r.json()
  // Build a clean location string: neighbourhood/suburb, city, country
  const a = data.address || {}
  const parts = [
    a.suburb || a.neighbourhood || a.quarter || a.district,
    a.city || a.town || a.municipality || a.county,
    a.country
  ].filter(Boolean)
  return {
    display: parts.join(', '),
    city: a.city || a.town || a.municipality || a.county || '',
    suburb: a.suburb || a.neighbourhood || a.quarter || '',
    country: a.country || '',
    full: data.display_name || ''
  }
}

export default function MapPicker({ onSelect, onClose }) {
  const mapRef = useRef(null)
  const leafletMap = useRef(null)
  const markerRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [geocoding, setGeocoding] = useState(false)
  const [selected, setSelected] = useState(null)
  const [searchVal, setSearchVal] = useState('')
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    let map = null

    loadLeaflet().then(L => {
      if (!mapRef.current || leafletMap.current) return

      map = L.map(mapRef.current, { zoomControl: true }).setView([38.0, 23.7], 6)
      leafletMap.current = map

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
      }).addTo(map)

      setLoading(false)

      map.on('click', async (e) => {
        const { lat, lng } = e.latlng
        setGeocoding(true)

        // Place/update marker
        if (markerRef.current) {
          markerRef.current.setLatLng([lat, lng])
        } else {
          const icon = L.divIcon({
            html: `<div style="width:24px;height:24px;background:#0f0f0e;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            className: ''
          })
          markerRef.current = L.marker([lat, lng], { icon }).addTo(map)
        }

        try {
          const geo = await reverseGeocode(lat, lng)
          setSelected({ lat, lng, ...geo })
        } catch {
          setSelected({ lat, lng, display: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, city: '', suburb: '' })
        } finally {
          setGeocoding(false)
        }
      })
    })

    return () => {
      if (leafletMap.current) {
        leafletMap.current.remove()
        leafletMap.current = null
      }
    }
  }, [])

  async function searchLocation() {
    if (!searchVal.trim()) return
    setSearching(true)
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchVal)}&format=json&limit=1&accept-language=en`,
        { headers: { 'User-Agent': 'LeadForge/1.0' } }
      )
      const results = await r.json()
      if (results.length && leafletMap.current) {
        const { lat, lon, display_name } = results[0]
        const L = window.L
        const latlng = [parseFloat(lat), parseFloat(lon)]
        leafletMap.current.setView(latlng, 13)

        if (markerRef.current) {
          markerRef.current.setLatLng(latlng)
        } else {
          const icon = L.divIcon({
            html: `<div style="width:24px;height:24px;background:#0f0f0e;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>`,
            iconSize: [24, 24], iconAnchor: [12, 24], className: ''
          })
          markerRef.current = L.marker(latlng, { icon }).addTo(leafletMap.current)
        }

        const geo = await reverseGeocode(parseFloat(lat), parseFloat(lon))
        setSelected({ lat: parseFloat(lat), lng: parseFloat(lon), ...geo })
      }
    } catch (e) {
      console.error(e)
    } finally {
      setSearching(false)
    }
  }

  function confirm() {
    if (!selected) return
    // Build the best location string for Google Places
    const location = selected.suburb
      ? `${selected.suburb}, ${selected.city}`
      : selected.city || selected.display
    onSelect(location, selected)
    onClose()
  }

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100
      }} />

      {/* Modal */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 720, maxWidth: '95vw',
        background: 'var(--surface)', borderRadius: 'var(--rl)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        zIndex: 101, overflow: 'hidden',
        display: 'flex', flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0
        }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Pick a location</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
              Search or click anywhere on the map
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', fontSize: 18,
            color: 'var(--text3)', cursor: 'pointer', padding: '0 4px'
          }}>✕</button>
        </div>

        {/* Search bar */}
        <div style={{
          padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border)',
          display: 'flex', gap: 8, flexShrink: 0
        }}>
          <input
            value={searchVal}
            onChange={e => setSearchVal(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && searchLocation()}
            placeholder="Search for a city, neighbourhood, street..."
            style={{ flex: 1 }}
          />
          <button onClick={searchLocation} disabled={searching} style={{
            padding: '7px 14px', background: 'var(--surface2)', border: '1px solid var(--border2)',
            borderRadius: 'var(--r)', fontSize: 13, cursor: 'pointer', fontWeight: 500,
            color: 'var(--text)', whiteSpace: 'nowrap'
          }}>
            {searching ? 'Searching...' : 'Search'}
          </button>
        </div>

        {/* Map */}
        <div style={{ position: 'relative', height: 380, flexShrink: 0 }}>
          {loading && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
              justifyContent: 'center', background: 'var(--surface2)', zIndex: 1,
              fontSize: 13, color: 'var(--text2)'
            }}>
              Loading map...
            </div>
          )}
          <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
        </div>

        {/* Footer */}
        <div style={{
          padding: '0.875rem 1.25rem', borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0
        }}>
          <div style={{ fontSize: 13 }}>
            {geocoding
              ? <span style={{ color: 'var(--text3)' }}>Identifying location...</span>
              : selected
                ? <span>
                    <span style={{ color: 'var(--text3)', fontSize: 11, marginRight: 6 }}>Selected:</span>
                    <strong>{selected.display}</strong>
                  </span>
                : <span style={{ color: 'var(--text3)' }}>Click on the map to select a location</span>
            }
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{
              padding: '7px 14px', background: 'none', border: '1px solid var(--border2)',
              borderRadius: 'var(--r)', fontSize: 13, cursor: 'pointer', color: 'var(--text2)'
            }}>Cancel</button>
            <button onClick={confirm} disabled={!selected || geocoding} style={{
              padding: '7px 16px', background: selected ? 'var(--accent)' : 'var(--surface2)',
              border: 'none', borderRadius: 'var(--r)', fontSize: 13, cursor: selected ? 'pointer' : 'not-allowed',
              color: selected ? '#fff' : 'var(--text3)', fontWeight: 500
            }}>
              Use this location →
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
