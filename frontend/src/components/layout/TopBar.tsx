import { useState, useEffect, memo } from 'react'
import { useSync } from '../../hooks/useGlobalSync'
import { useSSE } from '../../hooks/useSSE'
import { useHealth } from '../../hooks/useQueries'
import { RefreshCcw, ShieldCheck, Zap, Clock, User } from 'lucide-react'
import type { HealthStatus } from '../../types'

/* ── Live clock ─────────────────────────────────────────────────────── */
const LiveClock = memo(function LiveClock() {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#000', fontWeight: 600 }}>
      <Clock size={14} color="var(--ink-4)" />
      <span style={{ fontSize: '0.8125rem', fontFamily: 'JetBrains Mono, monospace', fontVariantNumeric: 'tabular-nums' }}>
        {time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
      </span>
    </div>
  )
})

/* ── Health indicator ──────────────────────────────────────────────── */
function HealthStatusPill({ health }: { health: HealthStatus | undefined }) {
  const [open, setOpen] = useState(false)
  const ok = health?.status === 'healthy'
  
  return (
    <div style={{ position: 'relative' }}>
      <div 
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        style={{ 
          display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '6px 12px', 
          background: '#fff', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer'
        }}
      >
        <ShieldCheck size={14} color={ok ? '#16a34a' : '#d97706'} />
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#000', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
          API {ok ? 'Healthy' : 'Degraded'}
        </span>
      </div>
      
      {open && health && (
        <div style={{ 
          position: 'absolute', top: '110%', right: 0, width: '200px', background: '#fff', 
          border: '1px solid #000', borderRadius: '4px', boxShadow: 'var(--shadow-lg)', zIndex: 100, padding: '1rem'
        }}>
          <div style={{ fontSize: '0.625rem', fontWeight: 800, color: 'var(--ink-4)', textTransform: 'uppercase', marginBottom: '0.75rem' }}>Subsystems</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {[
              { label: 'DB', val: health.database },
              { label: 'AI', val: health.bedrock },
              { label: 'AGENTS', val: health.strands_agents }
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                <span style={{ color: 'var(--ink-3)', fontWeight: 500 }}>{s.label}</span>
                <span style={{ color: s.val === 'ok' ? '#16a34a' : '#d97706', fontWeight: 700 }}>{s.val.toUpperCase()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Refresh button ───────────────────────────────────────────────── */
function RefreshButton() {
  const { canRefresh, isRefreshing, forceRefresh, cooldownRemaining, lastSyncedLabel } = useSync()

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: '0.625rem', color: 'var(--ink-4)', fontWeight: 700, textTransform: 'uppercase' }}>Last Sync</div>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#000', fontFamily: 'JetBrains Mono' }}>{lastSyncedLabel}</div>
      </div>
      <button
        onClick={forceRefresh}
        disabled={!canRefresh}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '8px 16px',
          background: '#fff', border: '1px solid #000', borderRadius: '6px',
          color: '#000', fontSize: '0.75rem', fontWeight: 700, cursor: canRefresh ? 'pointer' : 'not-allowed',
          opacity: canRefresh ? 1 : 0.5, transition: 'all 200ms'
        }}
        onMouseEnter={e => { if (canRefresh) { e.currentTarget.style.background = '#000'; e.currentTarget.style.color = '#fff' } }}
        onMouseLeave={e => { if (canRefresh) { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#000' } }}
      >
        <RefreshCcw size={14} className={isRefreshing ? 'animate-spin' : ''} />
        {isRefreshing ? 'Syncing' : cooldownRemaining > 0 ? `${cooldownRemaining}s` : 'Refresh Engine'}
      </button>
    </div>
  )
}

/* ── SSE Status ───────────────────────────────────────────────────── */
function SSEStatus() {
  const { connectionStatus } = useSSE({ maxEvents: 1 })
  const isLive = connectionStatus === 'connected'
  
  return (
    <div style={{ 
      display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '6px 12px', 
      background: isLive ? '#f0fdf4' : 'var(--bg-hover)', border: `1px solid ${isLive ? '#dcfce7' : 'var(--border)'}`, borderRadius: '6px'
    }}>
      <Zap size={14} color={isLive ? '#16a34a' : 'var(--ink-4)'} fill={isLive ? '#16a34a' : 'none'} />
      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: isLive ? '#16a34a' : 'var(--ink-4)', textTransform: 'uppercase' }}>
        {isLive ? 'Live' : 'Offline'}
      </span>
    </div>
  )
}

/* ── Logo ─────────────────────────────────────────────────────────── */
function Logo() {
  return (
    <div style={{ position: 'relative', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Background Frame */}
      <div style={{ position: 'absolute', inset: 0, background: '#000', borderRadius: '8px' }} />
      
      {/* S-Route Logo */}
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ zIndex: 1 }}>
        {/* The S Curve */}
        <path 
          d="M18 6C12 6 6 6 6 10C6 14 18 10 18 14C18 18 12 18 6 18" 
          stroke="#fff" 
          strokeWidth="2.5" 
          strokeLinecap="round" 
          strokeLinejoin="round"
        />
        
        {/* Origin Node */}
        <circle cx="18" cy="6" r="2.25" fill="#fff" />
        
        {/* Destination Node */}
        <circle cx="6" cy="18" r="2.25" fill="#fff" />
      </svg>
    </div>
  )
}

/* ── TopBar ─────────────────────────────────────────────────────────── */
export function TopBar() {
  const { data: health } = useHealth()

  return (
    <header style={{
      height: '72px',
      background: '#fff',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 2rem',
      gap: '2rem',
      flexShrink: 0,
      zIndex: 50,
    }}>
      {/* Brand Cluster */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
        <Logo />
        <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#000', letterSpacing: '-0.04em' }}>
          SupplySense
        </span>
      </div>

      <div style={{ flex: 1 }} />

      {/* System Control Cluster */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <SSEStatus />
          <HealthStatusPill health={health} />
        </div>
        
        <div style={{ width: '1px', height: '32px', background: 'var(--border)' }} />
        
        <RefreshButton />
        
        <div style={{ width: '1px', height: '32px', background: 'var(--border)' }} />
        
        <LiveClock />
        
        <div style={{
          width: '36px', height: '36px', borderRadius: '50%', background: '#000',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff'
        }}>
          <User size={18} />
        </div>
      </div>
    </header>
  )
}
