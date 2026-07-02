import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSuppliers, useSupplierDependencies } from '../hooks/useQueries'
import {
  Map as MapView, MapMarker, MarkerContent, MarkerTooltip,
  MapArc, MapControls,
  type MapRef, type MapArcDatum,
} from '@/components/ui/map'
import { MapPin, X, ExternalLink, Sun, Moon, CloudRain } from 'lucide-react'
import type { Supplier, SupplierDependency } from '../types'

const ARC_PALETTE = [
  '#6366F1', '#10B981', '#06B6D4', '#F43F5E',
  '#8B5CF6', '#EC4899', '#14B8A6', '#EF4444',
]

const T1_COLOR_LIGHT = '#F59E0B'
const T1_COLOR_DARK  = '#A78BFA'

/* ── Weather types ────────────────────────────────────────────────────── */
type WeatherSeverity = 'red' | 'orange' | 'yellow'

type WeatherAlert = {
  icon: string
  label: string
  severity: WeatherSeverity
  color: string
  precip: number    // mm
  maxTemp: number   // °C
  wmoCode: number
}

const SEVERITY_COLOR: Record<WeatherSeverity, string> = {
  red:    '#EF4444',
  orange: '#F97316',
  yellow: '#CA8A04',
}

// Maps Open-Meteo WMO codes + temp/precip to IMD-style warning categories
// Priority codes from user: 2(Heavy Rain), 4(Thunderstorm), 5(Hailstorm),
//                           9(Heat Wave), 16(Very Heavy Rain), 17(Ext Heavy Rain)
function classifyWeather(code: number, precip: number, maxTemp: number): WeatherAlert | null {
  const base = { precip, maxTemp, wmoCode: code }

  // Thunderstorm with hail (IMD code 5)
  if (code === 99) return { ...base, icon: '⛈️', label: 'Severe Thunderstorm + Hail', severity: 'red',    color: SEVERITY_COLOR.red }
  if (code === 96) return { ...base, icon: '⛈️', label: 'Thunderstorm with Hail',      severity: 'red',    color: SEVERITY_COLOR.red }
  // Thunderstorm (IMD code 4)
  if (code === 95) return { ...base, icon: '⛈️', label: 'Thunderstorm',                severity: 'orange', color: SEVERITY_COLOR.orange }

  // Extremely heavy rain — IMD: ≥ 64.5 mm/day (code 17)
  if (precip >= 64.5 || code === 82)
    return { ...base, icon: '🌧️', label: 'Extremely Heavy Rain',  severity: 'red',    color: SEVERITY_COLOR.red }
  // Very heavy rain — IMD: ≥ 35.5 mm/day (code 16)
  if (precip >= 35.5 || code === 81)
    return { ...base, icon: '🌧️', label: 'Very Heavy Rain',        severity: 'orange', color: SEVERITY_COLOR.orange }
  // Heavy rain — IMD: ≥ 15.6 mm/day (code 2)
  if (precip >= 15.6 || code === 65)
    return { ...base, icon: '🌦️', label: 'Heavy Rain',             severity: 'orange', color: SEVERITY_COLOR.orange }

  // Heat wave (IMD code 9) — >40°C for plains, >37°C for hills
  if (maxTemp >= 45) return { ...base, icon: '🌡️', label: 'Extreme Heat Wave', severity: 'red',    color: SEVERITY_COLOR.red }
  if (maxTemp >= 40) return { ...base, icon: '🌡️', label: 'Heat Wave',          severity: 'orange', color: SEVERITY_COLOR.orange }

  // Snow showers (IMD code 3)
  if (code === 86 || code === 85)
    return { ...base, icon: '❄️', label: 'Snow Showers', severity: 'yellow', color: SEVERITY_COLOR.yellow }

  // Moderate rain (yellow advisory)
  if (precip >= 7.6 || code === 63 || code === 80)
    return { ...base, icon: '🌦️', label: 'Moderate Rain', severity: 'yellow', color: SEVERITY_COLOR.yellow }

  return null
}

async function fetchSupplierWeather(s: Supplier): Promise<{ id: string; alert: WeatherAlert | null }> {
  if (!s.latitude || !s.longitude) return { id: s.id, alert: null }
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${s.latitude}&longitude=${s.longitude}&daily=weathercode,precipitation_sum,temperature_2m_max&timezone=Asia%2FKolkata&forecast_days=1`
    const res = await fetch(url)
    if (!res.ok) return { id: s.id, alert: null }
    const data = await res.json()
    const code    = data.daily?.weathercode?.[0]       ?? 0
    const precip  = data.daily?.precipitation_sum?.[0] ?? 0
    const maxTemp = data.daily?.temperature_2m_max?.[0] ?? 0
    return { id: s.id, alert: classifyWeather(code, precip, maxTemp) }
  } catch {
    return { id: s.id, alert: null }
  }
}

/* ── Arc types ─────────────────────────────────────────────────────────── */
type ArcDatum = MapArcDatum & {
  dependency_type: string
  criticality: number
  supplier_name: string
  depends_on_name: string
}

function formatDepType(raw: string) {
  return raw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function reliabilityColor(score: number) {
  if (score >= 0.85) return '#059669'
  if (score >= 0.70) return '#D97706'
  return '#DC2626'
}

/* ── Weather chip (appears above the supplier dot) ────────────────────── */
const WEATHER_LABEL: Record<string, string> = {
  'Severe Thunderstorm + Hail': 'Storm + Hail',
  'Thunderstorm with Hail':     'Storm + Hail',
  'Thunderstorm':               'Thunderstorm',
  'Extremely Heavy Rain':       'Ext. Heavy Rain',
  'Very Heavy Rain':            'Very Heavy Rain',
  'Heavy Rain':                 'Heavy Rain',
  'Extreme Heat Wave':          'Extreme Heat',
  'Heat Wave':                  'Heat Wave',
  'Snow Showers':               'Snow Showers',
  'Moderate Rain':              'Moderate Rain',
}

function WeatherChip({ alert, dotSize }: { alert: WeatherAlert; dotSize: number }) {
  const label = WEATHER_LABEL[alert.label] ?? alert.label
  const gap   = Math.round(dotSize * 0.4) + 2
  return (
    <div style={{
      position: 'absolute',
      bottom: `calc(100% + ${gap}px)`,
      left: '50%',
      // translateZ(0) forces GPU layer → eliminates sub-pixel blur from translateX(-50%)
      transform: 'translateX(-50%) translateZ(0)',
      pointerEvents: 'none',
      zIndex: 1,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
    }}>
      <div style={{
        background: '#fff',
        border: `1.5px solid ${alert.color}`,
        borderRadius: '99px',
        padding: '3px 10px',
        fontSize: '0.65rem',
        fontWeight: 700,
        color: alert.color,
        whiteSpace: 'nowrap',
        lineHeight: 1.4,
        display: 'flex', alignItems: 'center', gap: '5px',
        boxShadow: `0 2px 8px rgba(0,0,0,0.12), 0 0 0 1px ${alert.color}18`,
        letterSpacing: '0.01em',
      }}>
        <div style={{ width: 5, height: 5, borderRadius: '50%', background: alert.color, flexShrink: 0 }} />
        {label}
      </div>
      <div style={{
        width: 0, height: 0,
        borderLeft: '3px solid transparent',
        borderRight: '3px solid transparent',
        borderTop: `4px solid ${alert.color}`,
        marginTop: '-1px',
      }} />
    </div>
  )
}

/* ── Detail panel ──────────────────────────────────────────────────────── */
function DetailPanel({
  supplier, deps, supplierLookup, depTypeColorMap, t1Color, onClose, onNavigate,
}: {
  supplier: Supplier
  deps: SupplierDependency[]
  supplierLookup: Map<string, Supplier>
  depTypeColorMap: Map<string, string>
  t1Color: string
  onClose: () => void
  onNavigate: (id: string) => void
}) {
  const rel      = Math.round(supplier.reliability_score * 100)
  const relColor = reliabilityColor(supplier.reliability_score)

  return (
    <div style={{
      position: 'absolute', top: '12px', right: '12px', bottom: '12px',
      width: '256px', zIndex: 20,
      background: '#FFFFFF',
      borderRadius: '12px',
      border: '1px solid #E2E8F0',
      boxShadow: '0 4px 24px rgba(0,0,0,0.10)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      animation: 'panelSlideIn 0.22s cubic-bezier(0.16,1,0.3,1)',
    }}>
      {/* Name block */}
      <div style={{ padding: '16px 16px 12px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <span style={{
            fontSize: '0.5625rem', fontWeight: 700, letterSpacing: '0.07em',
            textTransform: 'uppercase',
            color: supplier.tier === 1 ? t1Color : '#475569',
            background: supplier.tier === 1 ? `${t1Color}18` : '#F1F5F9',
            border: `1px solid ${supplier.tier === 1 ? `${t1Color}55` : '#E2E8F0'}`,
            padding: '2px 7px', borderRadius: '4px',
          }}>
            Tier {supplier.tier}
          </span>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#94A3B8', padding: '2px', display: 'flex', alignItems: 'center',
          }}>
            <X size={14} />
          </button>
        </div>
        <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0F172A', lineHeight: 1.2, marginBottom: '4px' }}>
          {supplier.name}
        </div>
        <div style={{ fontSize: '0.6875rem', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '3px' }}>
          <MapPin size={10} style={{ flexShrink: 0 }} />
          {supplier.city}, {supplier.state}
        </div>
      </div>

      {/* Stats */}
      <div style={{
        margin: '0 12px 12px',
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
        border: '1px solid #F1F5F9', borderRadius: '8px',
        overflow: 'hidden', flexShrink: 0,
      }}>
        {[
          { label: 'Reliability', value: `${rel}%`,                              color: relColor },
          { label: 'Lead time',   value: `${supplier.lead_time_days}d`,           color: '#0F172A' },
          { label: 'Category',    value: supplier.category?.split(' ')[0] ?? '—', color: '#334155' },
        ].map((s, i) => (
          <div key={i} style={{
            padding: '8px 6px', textAlign: 'center',
            borderRight: i < 2 ? '1px solid #F1F5F9' : 'none',
            background: '#FAFBFC',
          }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '0.5rem', color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: '1px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Risk zone */}
      {supplier.risk_zone && (
        <div style={{
          margin: '0 12px 12px',
          padding: '6px 10px', borderRadius: '6px',
          border: '1px solid #FECACA', background: '#FFF5F5',
          display: 'flex', alignItems: 'center', gap: '7px', flexShrink: 0,
        }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#EF4444', flexShrink: 0 }} />
          <span style={{ fontSize: '0.6875rem', color: '#DC2626', fontWeight: 600 }}>
            {supplier.risk_zone.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
          </span>
        </div>
      )}

      <div style={{ height: '1px', background: '#F1F5F9', flexShrink: 0 }} />

      {/* Upstream deps */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 8px' }}>
        {deps.length > 0 ? (
          <>
            <div style={{ fontSize: '0.5625rem', fontWeight: 700, color: '#CBD5E1', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '10px' }}>
              Upstream · {deps.length}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              {deps.map((dep, idx) => {
                const depS     = supplierLookup.get(dep.depends_on_id)
                if (!depS) return null
                const arcColor = depTypeColorMap.get(dep.dependency_type) ?? '#94A3B8'
                const critPct  = Math.round(dep.criticality * 100)
                const critColor = dep.criticality >= 0.8 ? '#DC2626' : dep.criticality >= 0.6 ? '#D97706' : '#059669'
                const isLast    = idx === deps.length - 1
                return (
                  <div key={dep.id} style={{
                    padding: '10px 0',
                    borderBottom: isLast ? 'none' : '1px solid #F8FAFC',
                    display: 'flex', flexDirection: 'column', gap: '5px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: arcColor, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {depS.name}
                        </div>
                        <div style={{ fontSize: '0.625rem', color: '#94A3B8', marginTop: '1px' }}>
                          {depS.city} · {formatDepType(dep.dependency_type)}
                        </div>
                      </div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: critColor, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                        {critPct}%
                      </span>
                    </div>
                    <div style={{ height: '2px', background: '#F1F5F9', borderRadius: '99px', marginLeft: '14px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${critPct}%`, background: critColor, borderRadius: '99px', transition: 'width 0.5s ease' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <div style={{ color: '#CBD5E1', fontSize: '0.8125rem', textAlign: 'center', paddingTop: '20px' }}>
            No upstream dependencies
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '10px 12px 12px', flexShrink: 0 }}>
        <button
          onClick={() => onNavigate(supplier.id)}
          style={{
            width: '100%', padding: '8px 0',
            background: '#0F172A', color: '#FFF',
            border: 'none', borderRadius: '8px',
            fontSize: '0.75rem', fontWeight: 600,
            cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center', gap: '5px',
            transition: 'background 150ms ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#1E293B' }}
          onMouseLeave={e => { e.currentTarget.style.background = '#0F172A' }}
        >
          View full profile <ExternalLink size={11} />
        </button>
      </div>
    </div>
  )
}

/* ── Main component ────────────────────────────────────────────────────── */
function SupplierNetworkMap() {
  const navigate = useNavigate()
  const mapRef   = useRef<MapRef>(null)
  const { data: supplierData, isLoading: loadingSuppliers } = useSuppliers()
  const { data: deps,         isLoading: loadingDeps }      = useSupplierDependencies()

  const [selectedId,   setSelectedId]   = useState<string | null>(null)
  const [panelSupplier, setPanelSupplier] = useState<Supplier | null>(null)
  const [mapTheme,     setMapTheme]     = useState<'light' | 'dark'>('light')

  // Weather layer
  const [weatherOn,      setWeatherOn]      = useState(false)
  const [weatherAlerts,  setWeatherAlerts]  = useState<Map<string, WeatherAlert>>(new Map())
  const [weatherLoading, setWeatherLoading] = useState(false)

  const t1Color         = mapTheme === 'dark' ? T1_COLOR_DARK  : T1_COLOR_LIGHT
  const t1ColorSelected = mapTheme === 'dark' ? '#C4B5FD'      : '#D97706'
  const t1GlowRgb       = mapTheme === 'dark' ? '167,139,250'  : '245,158,11'

  const suppliers    = supplierData?.suppliers ?? []
  const dependencies = (deps ?? []) as SupplierDependency[]

  const supplierLookup = useMemo(() => new Map(suppliers.map(s => [s.id, s])), [suppliers])

  const depsGraph = useMemo(() => {
    const graph = new Map<string, SupplierDependency[]>()
    for (const dep of dependencies) {
      const list = graph.get(dep.supplier_id) ?? []
      list.push(dep)
      graph.set(dep.supplier_id, list)
    }
    return graph
  }, [dependencies])

  const tier1 = useMemo(() => suppliers.filter(s => s.tier === 1), [suppliers])
  const tier2 = useMemo(() => suppliers.filter(s => s.tier === 2), [suppliers])

  const connectedTier2Ids = useMemo(() => {
    if (!selectedId) return new Set<string>()
    return new Set((depsGraph.get(selectedId) ?? []).map(d => d.depends_on_id))
  }, [selectedId, depsGraph])

  const depTypeColorMap = useMemo(() => {
    const types = [...new Set(dependencies.map(d => d.dependency_type))]
    const m = new Map<string, string>()
    types.forEach((t, i) => m.set(t, ARC_PALETTE[i % ARC_PALETTE.length]))
    return m
  }, [dependencies])

  const arcData = useMemo<ArcDatum[]>(() => {
    if (!selectedId) return []
    return (depsGraph.get(selectedId) ?? [])
      .filter(dep => {
        const from = supplierLookup.get(dep.supplier_id)
        const to   = supplierLookup.get(dep.depends_on_id)
        return from?.longitude && from?.latitude && to?.longitude && to?.latitude
      })
      .map(dep => {
        const from = supplierLookup.get(dep.supplier_id)!
        const to   = supplierLookup.get(dep.depends_on_id)!
        return {
          id:              `${dep.supplier_id}-${dep.depends_on_id}`,
          from:            [from.longitude!, from.latitude!] as [number, number],
          to:              [to.longitude!,   to.latitude!]   as [number, number],
          dependency_type: dep.dependency_type,
          criticality:     dep.criticality,
          supplier_name:   from.name,
          depends_on_name: to.name,
        }
      })
  }, [selectedId, depsGraph, supplierLookup])

  const arcPaintColor = useMemo(() => {
    const types = [...depTypeColorMap.entries()]
    if (types.length === 0) return '#64748B'
    if (types.length === 1) return types[0][1]
    const matchArgs: any[] = [['get', 'dependency_type']]
    for (const [type, color] of types) matchArgs.push(type, color)
    matchArgs.push('#64748B')
    return ['match', ...matchArgs]
  }, [depTypeColorMap])

  /* Weather fetch — fires when toggle turns on */
  useEffect(() => {
    if (!weatherOn || suppliers.length === 0) return
    setWeatherLoading(true)
    Promise.all(suppliers.map(fetchSupplierWeather)).then(results => {
      const map = new Map<string, WeatherAlert>()
      for (const { id, alert } of results) {
        if (alert) map.set(id, alert)
      }
      setWeatherAlerts(map)
      setWeatherLoading(false)
    })
  }, [weatherOn, suppliers])

  const handleMarkerClick = useCallback((supplier: Supplier) => {
    if (supplier.tier === 1) {
      if (selectedId === supplier.id) {
        setSelectedId(null)
        setPanelSupplier(null)
      } else {
        setSelectedId(supplier.id)
        setPanelSupplier(supplier)
      }
    } else {
      setPanelSupplier(prev => prev?.id === supplier.id ? null : supplier)
    }
  }, [selectedId])

  const handleMapClick = useCallback(() => {
    setSelectedId(null)
    setPanelSupplier(null)
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const handler = (e: { point: [number, number]; originalEvent: MouseEvent }) => {
      const features   = map.queryRenderedFeatures(e.point as any)
      const isArcLayer = features.some(f => f.layer?.id?.startsWith('arc-'))
      if (!isArcLayer && !(e.originalEvent?.target as HTMLElement)?.closest?.('.maplibregl-marker')) {
        handleMapClick()
      }
    }
    map.on('click', handler)
    return () => { map.off('click', handler) }
  }, [handleMapClick])

  const getMarkerOpacity = useCallback((supplier: Supplier) => {
    if (!selectedId) return 1
    if (supplier.id === selectedId) return 1
    if (connectedTier2Ids.has(supplier.id)) return 1
    return 0.2
  }, [selectedId, connectedTier2Ids])

  const getMarkerSize = useCallback((supplier: Supplier) => {
    if (supplier.tier === 1) return supplier.id === selectedId ? 16 : 11
    return connectedTier2Ids.has(supplier.id) ? 9 : 6
  }, [selectedId, connectedTier2Ids])

  const panelDeps = panelSupplier?.tier === 1 ? (depsGraph.get(panelSupplier.id) ?? []) : []
  const loading   = loadingSuppliers || loadingDeps

  /* Shared button style factory */
  const mapBtn = (active: boolean, dark: boolean) => ({
    width: 34, height: 34,
    background: active
      ? (dark ? '#A78BFA' : '#0F172A')
      : (dark ? '#1E293B' : '#FFFFFF'),
    border: `1px solid ${active ? 'transparent' : (dark ? '#334155' : '#CBD5E1')}`,
    borderRadius: '8px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', zIndex: 10,
    boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
    color: active ? '#FFF' : (dark ? '#CBD5E1' : '#334155'),
    transition: 'all 200ms ease',
  } as React.CSSProperties)

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '10px', overflow: 'hidden', border: '1px solid #E2E8F0' }}>
      <MapView
        ref={mapRef}
        center={[78.9, 22.5]}
        zoom={4.2}
        theme={mapTheme}
        styles={{
          light: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
          dark:  'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
        }}
        minZoom={3}
        maxZoom={12}
        loading={loading}
      >
        <MapControls position="bottom-right" showZoom showCompass className="map-controls-styled !bottom-14 !right-3" />

        {/* Tier-2 markers */}
        {tier2.map(s => {
          if (!s.latitude || !s.longitude) return null
          const opacity      = getMarkerOpacity(s)
          const size         = getMarkerSize(s)
          const isConnected  = connectedTier2Ids.has(s.id)
          const weatherAlert = weatherOn ? weatherAlerts.get(s.id) : undefined
          return (
            <MapMarker key={s.id} longitude={s.longitude} latitude={s.latitude} onClick={() => handleMarkerClick(s)}>
              <MarkerContent>
                {/* Container anchors at dot center; weather chip overflows upward absolutely */}
                <div style={{ position: 'relative', width: size, height: size }}>
                  {weatherAlert && <WeatherChip alert={weatherAlert} dotSize={size} />}
                  <div style={{
                    width: size, height: size, borderRadius: '50%',
                    background: '#FFFFFF',
                    border: `1.5px solid ${isConnected ? '#94A3B8' : '#CBD5E1'}`,
                    opacity,
                    transition: 'all 300ms cubic-bezier(0.16, 1, 0.3, 1)',
                    cursor: 'pointer',
                    boxShadow: isConnected
                      ? '0 0 0 2.5px rgba(245,158,11,0.35), 0 1px 4px rgba(0,0,0,0.25)'
                      : '0 1px 3px rgba(0,0,0,0.28)',
                  }} />
                </div>
              </MarkerContent>
              <MarkerTooltip className="!bg-white !text-slate-800 !rounded-lg !px-0 !py-0 !shadow-none" {...({ style: { boxShadow: '0 4px 14px rgba(0,0,0,0.09)', border: '1px solid #E2E8F0' } } as any)}>
                <div style={{ padding: '5px 9px', minWidth: 0 }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#0F172A', lineHeight: 1.3, whiteSpace: 'nowrap' }}>{s.name}</div>
                  <div style={{ fontSize: '0.6rem', color: '#94A3B8', marginTop: '1px' }}>{s.city}, {s.state}</div>
                  {weatherAlert && (
                    <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <div style={{ width: 4, height: 4, borderRadius: '50%', background: weatherAlert.color, flexShrink: 0 }} />
                      <span style={{ fontSize: '0.6rem', color: weatherAlert.color, fontWeight: 700 }}>{weatherAlert.label}</span>
                    </div>
                  )}
                </div>
              </MarkerTooltip>
            </MapMarker>
          )
        })}

        {/* Tier-1 markers */}
        {tier1.map(s => {
          if (!s.latitude || !s.longitude) return null
          const opacity      = getMarkerOpacity(s)
          const size         = getMarkerSize(s)
          const isSelected   = s.id === selectedId
          const hasDeps      = depsGraph.has(s.id)
          const weatherAlert = weatherOn ? weatherAlerts.get(s.id) : undefined
          return (
            <MapMarker key={s.id} longitude={s.longitude} latitude={s.latitude} onClick={() => handleMarkerClick(s)}>
              <MarkerContent>
                <div style={{ position: 'relative', width: size, height: size }}>
                  {weatherAlert && <WeatherChip alert={weatherAlert} dotSize={size} />}
                  <div style={{
                    width: size, height: size, borderRadius: '50%',
                    background: isSelected ? t1ColorSelected : t1Color,
                    border: '2px solid #FFFFFF',
                    opacity,
                    transition: 'all 300ms cubic-bezier(0.16, 1, 0.3, 1)',
                    cursor: hasDeps ? 'pointer' : 'default',
                    boxShadow: isSelected
                      ? `0 0 0 3px rgba(${t1GlowRgb},0.35), 0 2px 8px rgba(${t1GlowRgb},0.25)`
                      : '0 1px 3px rgba(0,0,0,0.2)',
                    ...(isSelected ? { animation: 'map-pulse 2s ease-in-out infinite' } : {}),
                  }} />
                </div>
              </MarkerContent>
              <MarkerTooltip className="!bg-white !text-slate-800 !rounded-lg !px-0 !py-0 !shadow-none" {...({ style: { boxShadow: '0 4px 14px rgba(0,0,0,0.09)', border: '1px solid #E2E8F0' } } as any)}>
                <div style={{ padding: '5px 9px', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '1px' }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: t1Color, flexShrink: 0 }} />
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap' }}>{s.name}</div>
                  </div>
                  <div style={{ fontSize: '0.6rem', color: '#94A3B8', paddingLeft: '10px' }}>{s.city}, {s.state}</div>
                  {weatherAlert && (
                    <div style={{ marginTop: '4px', paddingLeft: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <div style={{ width: 4, height: 4, borderRadius: '50%', background: weatherAlert.color, flexShrink: 0 }} />
                      <span style={{ fontSize: '0.6rem', color: weatherAlert.color, fontWeight: 700 }}>{weatherAlert.label}</span>
                    </div>
                  )}
                </div>
              </MarkerTooltip>
            </MapMarker>
          )
        })}

        {/* Dependency arcs */}
        {arcData.length > 0 && (
          <MapArc
            data={arcData}
            curvature={0.15}
            samples={64}
            layout={{ 'line-join': 'round', 'line-cap': 'butt' }}
            paint={{
              'line-color':     arcPaintColor as any,
              'line-width':     ['interpolate', ['linear'], ['get', 'criticality'], 0.5, 0.8, 0.7, 1.2, 0.9, 1.8] as any,
              'line-opacity':   0.9,
              'line-dasharray': [2, 1.5] as any,
            }}
            hoverPaint={{ 'line-opacity': 1 }}
            onHover={() => {}}
          />
        )}
      </MapView>

      {/* Legend */}
      <div style={{
        position: 'absolute', bottom: '14px', left: '14px',
        background: mapTheme === 'dark' ? '#1E293B' : '#FFFFFF',
        border: `1px solid ${mapTheme === 'dark' ? '#334155' : '#CBD5E1'}`,
        borderRadius: '10px', padding: '12px 16px', zIndex: 10,
        display: 'flex', flexDirection: 'column', gap: '8px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)', minWidth: '140px',
      }}>
        <div style={{ fontSize: '0.5625rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Legend</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: t1Color, border: '2px solid #FFF', boxShadow: `0 0 0 1.5px rgba(${t1GlowRgb},0.5)`, flexShrink: 0 }} />
          <span style={{ fontSize: '0.75rem', color: mapTheme === 'dark' ? '#CBD5E1' : '#334155', fontWeight: 500 }}>Tier-1 Vendor</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#FFFFFF', border: '1.5px solid #94A3B8', boxShadow: '0 1px 3px rgba(0,0,0,0.25)', marginLeft: '1px', flexShrink: 0 }} />
          <span style={{ fontSize: '0.75rem', color: mapTheme === 'dark' ? '#CBD5E1' : '#334155', fontWeight: 500 }}>Tier-2 Supplier</span>
        </div>
        {selectedId && depTypeColorMap.size > 0 && (
          <>
            <div style={{ height: '1px', background: mapTheme === 'dark' ? '#334155' : '#E2E8F0', margin: '2px 0' }} />
            {[...depTypeColorMap.entries()].map(([type, color]) => (
              <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="18" height="4" style={{ flexShrink: 0 }}>
                  <line x1="0" y1="2" x2="18" y2="2" stroke={color} strokeWidth="2.5" strokeDasharray="4 3" strokeLinecap="butt" />
                </svg>
                <span style={{ fontSize: '0.75rem', color: mapTheme === 'dark' ? '#CBD5E1' : '#334155', fontWeight: 500 }}>{formatDepType(type)}</span>
              </div>
            ))}
          </>
        )}
        {weatherOn && weatherAlerts.size > 0 && (
          <>
            <div style={{ height: '1px', background: mapTheme === 'dark' ? '#334155' : '#E2E8F0', margin: '2px 0' }} />
            <div style={{ fontSize: '0.5625rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Weather</div>
            {[
              { color: SEVERITY_COLOR.red,    label: 'Severe alert' },
              { color: SEVERITY_COLOR.orange, label: 'Warning' },
              { color: SEVERITY_COLOR.yellow, label: 'Advisory' },
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                <span style={{ fontSize: '0.6875rem', color: mapTheme === 'dark' ? '#CBD5E1' : '#334155', fontWeight: 500 }}>{s.label}</span>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Top-right toggle buttons */}
      <div style={{
        position: 'absolute', top: '14px', right: panelSupplier ? '280px' : '14px',
        display: 'flex', gap: '4px', zIndex: 10,
        transition: 'right 220ms cubic-bezier(0.16,1,0.3,1)',
      }}>
        {/* Weather toggle */}
        <button
          onClick={() => setWeatherOn(v => !v)}
          title={weatherOn ? 'Hide weather layer' : 'Show weather alerts'}
          style={mapBtn(weatherOn, mapTheme === 'dark')}
          onMouseEnter={e => {
            if (!weatherOn) e.currentTarget.style.background = mapTheme === 'dark' ? '#334155' : '#F1F5F9'
          }}
          onMouseLeave={e => {
            if (!weatherOn) e.currentTarget.style.background = mapTheme === 'dark' ? '#1E293B' : '#FFFFFF'
          }}
        >
          {weatherLoading ? (
            <div style={{ width: 12, height: 12, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          ) : (
            <CloudRain size={14} />
          )}
        </button>

        {/* Theme toggle */}
        <button
          onClick={() => setMapTheme(t => t === 'light' ? 'dark' : 'light')}
          title={mapTheme === 'light' ? 'Dark map' : 'Light map'}
          style={mapBtn(false, mapTheme === 'dark')}
          onMouseEnter={e => { e.currentTarget.style.background = mapTheme === 'dark' ? '#334155' : '#F1F5F9' }}
          onMouseLeave={e => { e.currentTarget.style.background = mapTheme === 'dark' ? '#1E293B' : '#FFFFFF' }}
        >
          {mapTheme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
        </button>
      </div>

      {/* Detail panel */}
      {panelSupplier && (
        <DetailPanel
          supplier={panelSupplier}
          deps={panelDeps}
          supplierLookup={supplierLookup}
          depTypeColorMap={depTypeColorMap}
          t1Color={t1Color}
          onClose={() => { setPanelSupplier(null); if (panelSupplier.tier === 1) setSelectedId(null) }}
          onNavigate={id => navigate(`/companies/${id}`)}
        />
      )}

      <style>{`
        @keyframes map-pulse {
          0%, 100% { box-shadow: 0 0 0 3px rgba(${t1GlowRgb},0.35), 0 2px 8px rgba(${t1GlowRgb},0.2); }
          50%       { box-shadow: 0 0 0 8px rgba(${t1GlowRgb},0.08), 0 2px 8px rgba(${t1GlowRgb},0.1); }
        }
        @keyframes panelSlideIn {
          from { opacity: 0; transform: translateX(12px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

export default SupplierNetworkMap
