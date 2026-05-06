/**
 * IndiaMap — proper state-boundary 2D map using react-simple-maps
 * Shows supplier locations with risk color coding, hover tooltips, and filter buttons.
 */

import { useState, useMemo, useCallback } from 'react'
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup,
} from 'react-simple-maps'
import type { Supplier, SupplierRiskAnalysis } from '../../types'

// India states TopoJSON — hosted on jsdelivr (reliable CDN, no auth required)
const INDIA_TOPO_URL =
  'https://cdn.jsdelivr.net/gh/Anujarya300/bubble_maps@master/data/geography-data/india.topo.json'

/* ── Risk colour map ────────────────────────────────────────────────── */
const RISK_COLOR: Record<string, string> = {
  critical: '#DC2626',
  high:     '#D97706',
  medium:   '#2563EB',
  low:      '#059669',
}

const RISK_ORDER: Record<string, number> = { critical: 3, high: 2, medium: 1, low: 0 }

/* ── City pin aggregation ───────────────────────────────────────────── */
interface CityPin {
  key: string
  city: string
  state: string
  lat: number
  lng: number
  suppliers: { name: string; risk: string; score: number; id: string }[]
  worstRisk: string
  worstScore: number
}

function buildCityPins(
  suppliers: Supplier[],
  riskMap: Map<string, SupplierRiskAnalysis>,
): CityPin[] {
  const map = new Map<string, CityPin>()
  for (const s of suppliers) {
    if (!s.latitude || !s.longitude) continue
    const key = `${s.city}|${s.state}`
    const risk = riskMap.get(s.id)
    const riskLevel = risk?.risk_level ?? 'low'
    const riskScore = risk?.overall_score ?? 0
    if (!map.has(key)) {
      map.set(key, { key, city: s.city, state: s.state, lat: s.latitude, lng: s.longitude, suppliers: [], worstRisk: riskLevel, worstScore: riskScore })
    }
    const pin = map.get(key)!
    pin.suppliers.push({ name: s.name, risk: riskLevel, score: riskScore, id: s.id })
    if ((RISK_ORDER[riskLevel] ?? 0) > (RISK_ORDER[pin.worstRisk] ?? 0)) {
      pin.worstRisk = riskLevel
      pin.worstScore = riskScore
    }
  }
  return Array.from(map.values())
}

/* ── Tooltip ────────────────────────────────────────────────────────── */
function PinTooltip({ pin, onClose }: { pin: CityPin; onClose: () => void }) {
  const color = RISK_COLOR[pin.worstRisk] ?? 'var(--ink-4)'
  return (
    <div
      style={{
        position: 'absolute',
        top: '0.75rem', right: '0.75rem',
        width: '200px',
        background: 'var(--ink-1)',
        border: `1px solid ${color}40`,
        borderRadius: '0.75rem',
        padding: '0.875rem',
        boxShadow: '0 8px 28px rgba(0,0,0,0.45)',
        zIndex: 10,
        animation: 'fadeIn 150ms ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
          <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--bg-card)' }}>{pin.city}</span>
        </div>
        <button onClick={onClose} style={{ color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}>×</button>
      </div>
      <div style={{ fontSize: '0.625rem', color: 'rgba(255,255,255,0.35)', marginBottom: '0.625rem' }}>{pin.state}</div>
      <div style={{ fontSize: '0.75rem', fontWeight: 700, color, marginBottom: '0.5rem' }}>
        {pin.worstRisk.toUpperCase()} · {(pin.worstScore * 100).toFixed(0)}% risk
      </div>
      {pin.suppliers.map(s => (
        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginTop: '0.25rem' }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: RISK_COLOR[s.risk] ?? 'var(--ink-4)', flexShrink: 0 }} />
          <span style={{ fontSize: '0.625rem', color: 'rgba(255,255,255,0.6)' }}>{s.name}</span>
        </div>
      ))}
    </div>
  )
}

/* ── Filter buttons ──────────────────────────────────────────────────── */
type RiskFilter = 'all' | 'critical' | 'high' | 'medium' | 'low'

const FILTER_OPTIONS: { value: RiskFilter; label: string; color: string }[] = [
  { value: 'all',      label: 'All',      color: 'var(--ink-3)' },
  { value: 'critical', label: 'Critical', color: '#DC2626' },
  { value: 'high',     label: 'High',     color: '#D97706' },
  { value: 'medium',   label: 'Medium',   color: '#2563EB' },
  { value: 'low',      label: 'Low',      color: '#059669' },
]

/* ── IndiaMap ───────────────────────────────────────────────────────── */
interface IndiaMapProps {
  suppliers: Supplier[]
  risks: SupplierRiskAnalysis[]
  onCityClick?: (city: string, state?: string) => void
}

export function IndiaMap({ suppliers, risks, onCityClick }: IndiaMapProps) {
  const [activePin, setActivePin] = useState<CityPin | null>(null)
  const [filter, setFilter] = useState<RiskFilter>('all')
  const [zoom, setZoom] = useState(1)

  const riskMap = useMemo(
    () => new Map(risks.map(r => [r.supplier_id, r])),
    [risks]
  )

  const allPins = useMemo(
    () => buildCityPins(suppliers, riskMap),
    [suppliers, riskMap]
  )

  const visiblePins = useMemo(
    () => filter === 'all' ? allPins : allPins.filter(p => p.worstRisk === filter),
    [allPins, filter]
  )

  const handleMarkerClick = useCallback((pin: CityPin) => {
    setActivePin(prev => prev?.key === pin.key ? null : pin)
    onCityClick?.(pin.city, pin.state)
  }, [onCityClick])

  const counts = useMemo(() => ({
    critical: allPins.filter(p => p.worstRisk === 'critical').length,
    high:     allPins.filter(p => p.worstRisk === 'high').length,
    medium:   allPins.filter(p => p.worstRisk === 'medium').length,
    low:      allPins.filter(p => p.worstRisk === 'low').length,
  }), [allPins])

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: '0.625rem', position: 'relative' }}>

      {/* Filter buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexWrap: 'wrap' }}>
        {FILTER_OPTIONS.map(opt => {
          const count = opt.value === 'all' ? allPins.length : counts[opt.value as keyof typeof counts] ?? 0
          const isActive = filter === opt.value
          return (
            <button
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.3rem',
                padding: '0.25rem 0.625rem',
                borderRadius: '999px',
                fontSize: '0.6875rem', fontWeight: isActive ? 700 : 500,
                background: isActive ? opt.color : 'var(--border-strong)',
                color: isActive ? 'var(--bg-card)' : opt.color,
                border: `1px solid ${isActive ? opt.color : 'var(--border)'}`,
                cursor: 'pointer',
                transition: 'all 120ms',
                fontFamily: 'inherit',
              }}
            >
              {opt.label}
              {count > 0 && (
                <span style={{
                  minWidth: '16px', height: '16px', borderRadius: '50%',
                  background: isActive ? 'rgba(255,255,255,0.3)' : `${opt.color}20`,
                  color: isActive ? '#fff' : opt.color,
                  fontSize: '0.5625rem', fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '0 2px',
                }}>
                  {count}
                </span>
              )}
            </button>
          )
        })}

        {/* Zoom controls */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.25rem' }}>
          <button
            onClick={() => setZoom(z => Math.min(z + 0.5, 4))}
            style={{ width: '26px', height: '26px', borderRadius: '0.375rem', background: 'var(--border-strong)', border: '1px solid #E2E8F0', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}
            title="Zoom in"
          >
            +
          </button>
          <button
            onClick={() => setZoom(z => Math.max(z - 0.5, 1))}
            style={{ width: '26px', height: '26px', borderRadius: '0.375rem', background: 'var(--border-strong)', border: '1px solid #E2E8F0', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}
            title="Zoom out"
          >
            −
          </button>
          <button
            onClick={() => setZoom(1)}
            style={{ width: '26px', height: '26px', borderRadius: '0.375rem', background: 'var(--border-strong)', border: '1px solid #E2E8F0', cursor: 'pointer', fontSize: '0.5625rem', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', fontWeight: 700, color: 'var(--ink-3)' }}
            title="Reset zoom"
          >
            ⊙
          </button>
        </div>
      </div>

      {/* Map */}
      <div style={{ flex: 1, position: 'relative', borderRadius: '0.625rem', overflow: 'hidden', background: 'var(--bg-app)', border: '1px solid #F1F5F9' }}>
        <ComposableMap
          projection="geoMercator"
          projectionConfig={{
            center: [82.5, 22],
            scale: 1100,
          }}
          style={{ width: '100%', height: '100%' }}
        >
          <ZoomableGroup zoom={zoom} center={[82.5, 22]} minZoom={1} maxZoom={4}>

            {/* India states */}
            <Geographies geography={INDIA_TOPO_URL}>
              {({ geographies }) =>
                geographies.map(geo => (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    style={{
                      default: { fill: '#EAEAEC', stroke: 'var(--bg-card)', strokeWidth: 0.75, outline: 'none' },
                      hover:   { fill: '#D1D5DB', stroke: 'var(--bg-card)', strokeWidth: 0.75, outline: 'none' },
                      pressed: { fill: '#9CA3AF', outline: 'none' },
                    }}
                  />
                ))
              }
            </Geographies>

            {/* Supplier pins */}
            {visiblePins.map(pin => {
              const color = RISK_COLOR[pin.worstRisk] ?? 'var(--ink-4)'
              const isActive = activePin?.key === pin.key
              const r = pin.suppliers.length > 1 ? 7 : 6

              return (
                <Marker
                  key={pin.key}
                  coordinates={[pin.lng, pin.lat]}
                  onClick={() => handleMarkerClick(pin)}
                >
                  {/* Pulse ring for critical/high */}
                  {(pin.worstRisk === 'critical' || pin.worstRisk === 'high') && (
                    <circle
                      r={r + 6}
                      fill="none"
                      stroke={color}
                      strokeWidth="1.5"
                      opacity="0.3"
                      style={{ animation: 'pulseDot 2s ease-in-out infinite' }}
                    />
                  )}
                  {/* Shadow */}
                  <circle r={r + 2} fill={color} opacity="0.15" />
                  {/* Main dot */}
                  <circle
                    r={isActive ? r + 2 : r}
                    fill={color}
                    stroke="var(--bg-card)"
                    strokeWidth="2"
                    style={{
                      cursor: 'pointer',
                      filter: isActive ? `drop-shadow(0 0 6px ${color})` : 'none',
                      transition: 'r 150ms',
                    }}
                  />
                  {/* Count badge */}
                  {pin.suppliers.length > 1 && (
                    <text
                      y={2}
                      textAnchor="middle"
                      style={{ fill: '#fff', fontSize: '7px', fontWeight: 700, pointerEvents: 'none' }}
                    >
                      {pin.suppliers.length}
                    </text>
                  )}
                </Marker>
              )
            })}

          </ZoomableGroup>
        </ComposableMap>

        {/* Active pin tooltip */}
        {activePin && (
          <PinTooltip pin={activePin} onClose={() => setActivePin(null)} />
        )}

        {/* Legend */}
        <div style={{
          position: 'absolute', bottom: '0.5rem', left: '0.5rem',
          display: 'flex', gap: '0.625rem', flexWrap: 'wrap',
          background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(4px)',
          borderRadius: '0.5rem', padding: '0.375rem 0.625rem',
          border: '1px solid rgba(0,0,0,0.06)',
        }}>
          {Object.entries(RISK_COLOR).map(([level, color]) => (
            <div key={level} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block' }} />
              <span style={{ fontSize: '0.5625rem', color: '#475569', textTransform: 'capitalize', fontWeight: 500 }}>{level}</span>
            </div>
          ))}
        </div>

        {/* Empty state when filter hides all */}
        {visiblePins.length === 0 && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none',
          }}>
            <div style={{ background: 'rgba(255,255,255,0.9)', borderRadius: '0.625rem', padding: '0.75rem 1.25rem', fontSize: '0.8125rem', color: 'var(--ink-3)' }}>
              No {filter} risk suppliers
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
