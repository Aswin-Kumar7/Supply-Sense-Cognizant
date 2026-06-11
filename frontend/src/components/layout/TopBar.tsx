import { useState, useEffect, memo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSync } from '../../hooks/useGlobalSync'
import { useSSE } from '../../hooks/useSSE'
import { useHealth } from '../../hooks/useQueries'
import type { HealthStatus } from '../../types'


/* ── Live clock — isolated so only it re-renders every second ────────── */
const LiveClock = memo(function LiveClock() {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <span style={{ fontSize: '0.75rem', fontFamily: 'JetBrains Mono, monospace', color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' }}>
      {time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </span>
  )
})

/* ── Health indicator dot ───────────────────────────────────────────── */
function HealthDot({ health }: { health: HealthStatus | undefined }) {
  const [open, setOpen] = useState(false)
  if (!health) return <span className="dot dot-idle" style={{ opacity: 0.5 }} />

  const ok = health.status === 'healthy'
  const degraded = health.status === 'degraded'

  return (
    <div style={{ position: 'relative' }}>
      <button
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.375rem',
          background: 'transparent', border: 'none', cursor: 'pointer', padding: '0.25rem 0.5rem',
          borderRadius: '0.375rem',
          color: ok ? '#34D399' : degraded ? '#FCD34D' : '#F87171',
          fontSize: '0.6875rem', fontWeight: 600,
        }}
      >
        <span
          className={ok ? 'dot-live' : degraded ? 'dot-warn' : 'dot-error'}
          style={{
            display: 'inline-block', width: '7px', height: '7px', borderRadius: '999px', flexShrink: 0,
            background: ok ? '#10B981' : degraded ? '#F59E0B' : '#EF4444',
            boxShadow: ok ? '0 0 0 2px rgba(16,185,129,0.3)' : degraded ? '0 0 0 2px rgba(245,158,11,0.3)' : '0 0 0 2px rgba(239,68,68,0.3)',
          }}
        />
        API
      </button>
      {open && (
        <div className="animate-fade" style={{
          position: 'absolute', top: '36px', right: 0, zIndex: 200,
          minWidth: '220px', background: '#fff', border: '1px solid #E2E8F0',
          borderRadius: '0.75rem', boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
        }}>
          <div style={{ padding: '0.625rem 0.875rem', borderBottom: '1px solid #F1F5F9' }}>
            <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--ink-1)' }}>System Health</span>
          </div>
          <div style={{ padding: '0.75rem 0.875rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {([
              { label: 'Database',  val: health.database,         ok: health.database === 'ok' },
              { label: 'Bedrock',   val: health.bedrock,          ok: health.bedrock === 'ok' },
              { label: 'Agents',    val: health.strands_agents,   ok: health.strands_agents === 'ok' },
              { label: 'Engine',    val: health.synthetic_engine, ok: health.synthetic_engine === 'ok' },
            ]).map(s => (
              <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--ink-3)' }}>{s.label}</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: s.ok ? '#059669' : '#D97706' }}>
                  {s.val}
                </span>
              </div>
            ))}
            {health.session_count !== undefined && (
              <div style={{ paddingTop: '0.375rem', borderTop: '1px solid #F1F5F9' }}>
                <span style={{ fontSize: '0.6875rem', color: 'var(--ink-4)' }}>Active sessions: {health.session_count}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Refresh button with rate-limit countdown ───────────────────────── */
function RefreshButton() {
  const { canRefresh, isRefreshing, forceRefresh, cooldownRemaining, lastSyncedLabel } = useSync()

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <span style={{ fontSize: '0.6875rem', color: 'var(--ink-4)', whiteSpace: 'nowrap' }}>
        Synced {lastSyncedLabel}
      </span>
      <button
        onClick={forceRefresh}
        disabled={!canRefresh}
        title={!canRefresh ? `Wait ${cooldownRemaining}s` : 'Refresh all data'}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.3rem',
          padding: '0.3rem 0.625rem',
          background: canRefresh ? 'var(--bg-hover)' : 'transparent',
          border: '1px solid var(--border-strong)',
          borderRadius: '0.375rem',
          color: canRefresh ? 'var(--ink-2)' : 'var(--ink-4)',
          fontSize: '0.6875rem',
          fontWeight: 500,
          cursor: canRefresh ? 'pointer' : 'not-allowed',
          transition: 'all 150ms',
          fontFamily: 'inherit',
          whiteSpace: 'nowrap',
        }}
      >
        <svg
          width="12" height="12" viewBox="0 0 16 16" fill="none"
          style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }}
        >
          <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5c1.7 0 3.2.77 4.24 1.99" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M12 1v3.5H8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        {isRefreshing ? 'Syncing…' : cooldownRemaining > 0 ? `${cooldownRemaining}s` : 'Refresh'}
      </button>
    </div>
  )
}

/* ── Search bar ─────────────────────────────────────────────────────── */
function SearchBar() {
  const [focused, setFocused] = useState(false)
  const [query, setQuery] = useState('')
  const navigate = useNavigate()

  const handleKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && query.trim()) {
      navigate(`/risks?q=${encodeURIComponent(query.trim())}`)
      setQuery('')
    }
    if (e.key === 'Escape') setQuery('')
  }, [query, navigate])

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.5rem',
      background: focused ? 'var(--bg-card)' : 'var(--bg-hover)',
      border: `1px solid ${focused ? 'var(--primary-light)' : 'transparent'}`,
      boxShadow: focused ? '0 0 0 3px rgba(59,130,246,0.15)' : 'none',
      borderRadius: '0.5rem',
      padding: '0.375rem 0.75rem',
      width: '280px',
      transition: 'all 150ms',
    }}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--ink-4)" style={{ flexShrink: 0 }}>
        <circle cx="7" cy="7" r="5" strokeWidth="1.5"/>
        <path d="M11 11l3 3" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={handleKey}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="Search..."
        style={{
          flex: 1, background: 'none', border: 'none', outline: 'none',
          fontSize: '0.8125rem', color: 'var(--ink-1)',
          fontFamily: 'inherit',
        }}
      />
      <span style={{ fontSize: '0.5625rem', color: 'var(--ink-4)', background: 'var(--border)', padding: '0.125rem 0.375rem', borderRadius: '0.25rem', flexShrink: 0, fontWeight: 700 }}>
        ⌘K
      </span>
    </div>
  )
}

/* ── SSE pill ───────────────────────────────────────────────────────── */
function SSEPill() {
  const { connectionStatus } = useSSE({ maxEvents: 1 })
  const cfg = {
    connected:    { color: '#34D399', label: 'Live' },
    connecting:   { color: '#FCD34D', label: 'Connecting' },
    disconnected: { color: 'var(--ink-4)', label: 'Offline' },
    error:        { color: '#F87171', label: 'Error' },
  }
  const c = cfg[connectionStatus as keyof typeof cfg] ?? cfg.disconnected
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
      <span style={{
        width: '6px', height: '6px', borderRadius: '999px', background: c.color, display: 'inline-block',
        boxShadow: connectionStatus === 'connected' ? `0 0 0 2px ${c.color}33` : 'none',
        animation: connectionStatus === 'connected' ? 'pulseDot 2s ease-in-out infinite' : undefined,
      }} />
      <span style={{ fontSize: '0.6875rem', color: c.color, fontWeight: 500 }}>{c.label}</span>
    </div>
  )
}

/* ── TopBar ─────────────────────────────────────────────────────────── */
export function TopBar() {
  const { data: health } = useHealth()

  return (
    <header style={{
      height: '64px',
      background: 'var(--bg-topbar)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 1.75rem',
      gap: '1rem',
      flexShrink: 0,
      position: 'relative',
      zIndex: 50,
    }}>
      {/* Search */}
      <div style={{ flex: 1, display: 'flex' }}>
        <SearchBar />
      </div>

      {/* Right cluster */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <RefreshButton />
        <div style={{ width: '1px', height: '20px', background: 'var(--border)' }} />
        <SSEPill />
        <HealthDot health={health} />
        <div style={{ width: '1px', height: '20px', background: 'var(--border)' }} />
        <LiveClock />
        <div
          title="Naveen · UI / Frontend Dev"
          style={{
            width: '36px', height: '36px', borderRadius: '50%',
            background: 'linear-gradient(135deg, #2563EB, #7C3AED)',
            border: '2px solid #DBEAFE',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.6875rem', fontWeight: 800, color: '#fff',
            flexShrink: 0,
            marginLeft: '0.5rem',
            cursor: 'default',
            boxShadow: '0 2px 6px rgba(37,99,235,0.3)',
            letterSpacing: '0.02em',
          }}
        >
          NV
        </div>
      </div>
    </header>
  )
}
