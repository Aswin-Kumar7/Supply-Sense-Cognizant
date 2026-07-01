import { useState, useEffect, memo } from 'react'
import { useSync } from '../../hooks/useGlobalSync'
import { useSSE } from '../../hooks/useSSE'
import { useHealth } from '../../hooks/useQueries'
import { RefreshCcw, Zap } from 'lucide-react'
import type { HealthStatus } from '../../types'

const LiveClock = memo(function LiveClock() {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <span style={{
      fontSize: '0.75rem',
      fontFamily: "'Inter', system-ui, sans-serif",
      fontVariantNumeric: 'tabular-nums',
      color: '#64748B',
    }}>
      {time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
    </span>
  )
})

function HealthStatusPill({ health }: { health: HealthStatus | undefined }) {
  const [open, setOpen] = useState(false)
  const ok = health?.status === 'healthy'

  return (
    <div style={{ position: 'relative' }}>
      <div
        onMouseLeave={() => setOpen(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '4px 10px',
          background: ok ? 'rgba(16, 185, 129, 0.06)' : 'rgba(245, 158, 11, 0.06)',
          border: ok ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(245, 158, 11, 0.2)',
          borderRadius: '6px', cursor: 'pointer',
          transition: 'background 150ms ease, border-color 150ms ease',
        }}
        onMouseEnter={() => setOpen(true)}
      >
        <div style={{ 
          width: 6, 
          height: 6, 
          borderRadius: '50%', 
          background: ok ? '#10B981' : '#F59E0B',
          boxShadow: ok ? '0 0 6px rgba(16, 185, 129, 0.6)' : '0 0 6px rgba(245, 158, 11, 0.6)'
        }} />
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: ok ? '#059669' : '#D97706' }}>
          API
        </span>
      </div>

      {open && health && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: '180px',
          background: '#FFFFFF', border: '1px solid #E2E8F0',
          borderRadius: '8px', boxShadow: '0 4px 20px rgba(15, 23, 42, 0.08)',
          zIndex: 100, padding: '10px 12px',
        }}>
          <div style={{ fontSize: '0.625rem', fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
            Subsystems
          </div>
          {[
            { label: 'Database', val: health.database },
            { label: 'AI / Bedrock', val: health.bedrock },
            { label: 'Agents', val: health.strands_agents },
          ].map(s => (
            <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', padding: '4px 0' }}>
              <span style={{ color: '#64748B' }}>{s.label}</span>
              <span style={{ color: s.val === 'ok' ? '#059669' : '#D97706', fontWeight: 600, fontSize: '0.6875rem' }}>{s.val}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SSEStatus() {
  const { connectionStatus } = useSSE({ maxEvents: 1 })
  const isLive = connectionStatus === 'connected'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '6px',
      padding: '4px 10px',
      background: isLive ? 'rgba(16, 185, 129, 0.06)' : 'rgba(148, 163, 184, 0.06)',
      border: isLive ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(148, 163, 184, 0.2)',
      borderRadius: '6px',
    }}>
      <Zap size={12} strokeWidth={2.5} style={{ color: isLive ? '#10B981' : '#94A3B8' }} fill={isLive ? '#10B981' : 'none'} />
      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: isLive ? '#059669' : '#64748B' }}>
        {isLive ? 'Live' : 'Offline'}
      </span>
    </div>
  )
}

function RefreshButton() {
  const { canRefresh, isRefreshing, forceRefresh, cooldownRemaining, lastSyncedLabel } = useSync()

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span style={{ fontSize: '0.6875rem', color: '#94A3B8', fontVariantNumeric: 'tabular-nums' }}>
        {lastSyncedLabel}
      </span>
      <button
        onClick={forceRefresh}
        disabled={!canRefresh}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '5px 12px',
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '6px',
          color: '#334155',
          fontSize: '0.75rem', fontWeight: 600,
          cursor: canRefresh ? 'pointer' : 'not-allowed',
          opacity: canRefresh ? 1 : 0.4,
          transition: 'all 120ms ease',
        }}
        onMouseEnter={e => { if (canRefresh) { e.currentTarget.style.background = '#F8FAFC'; e.currentTarget.style.borderColor = '#CBD5E1'; } }}
        onMouseLeave={e => { if (canRefresh) { e.currentTarget.style.background = '#FFFFFF'; e.currentTarget.style.borderColor = '#E2E8F0'; } }}
      >
        <RefreshCcw size={12} strokeWidth={2.2} style={{ animation: isRefreshing ? 'topbar-spin 0.7s linear infinite' : 'none', color: '#334155' }} />
        {isRefreshing ? 'Syncing' : cooldownRemaining > 0 ? `${cooldownRemaining}s` : 'Refresh'}
      </button>
      <style>{`@keyframes topbar-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

export function TopBar() {
  const { data: health } = useHealth()

  return (
    <header style={{
      height: '56px',
      background: 'rgba(255, 255, 255, 0.75)',
      backdropFilter: 'blur(16px)',
      borderBottom: '1px solid rgba(241, 245, 249, 0.8)',
      boxShadow: '0 1px 3px rgba(15, 23, 42, 0.02), 0 4px 12px rgba(15, 23, 42, 0.01)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 24px',
      gap: '16px',
      flexShrink: 0,
      zIndex: 50,
      position: 'sticky',
      top: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <span style={{ 
          fontSize: '1rem', 
          fontWeight: 800, 
          color: 'rgba(15, 23, 42, 1)', 
          letterSpacing: '-0.03em',
          display: 'flex',
          alignItems: 'center',
        }}>
          Supply<span style={{ color: 'rgba(15, 23, 42, 1)' }}>Sense</span>
        </span>
        <div style={{ width: '1px', height: '12px', background: '#E2E8F0', margin: '0 4px' }} />
        <span style={{ 
          fontSize: '0.625rem', 
          fontWeight: 700, 
          color: '#94A3B8', 
          textTransform: 'uppercase',
          letterSpacing: '0.06em' 
        }}>
          by Cipher
        </span>
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <SSEStatus />
          <HealthStatusPill health={health} />
        </div>
        
        <div style={{ width: '1px', height: '16px', background: '#F1F5F9', margin: '0 4px' }} />
        <RefreshButton />
        
        <div style={{ width: '1px', height: '16px', background: '#F1F5F9', margin: '0 4px' }} />
        <LiveClock />
        
        <div style={{ width: '1px', height: '16px', background: '#F1F5F9', margin: '0 4px' }} />
        <div style={{
          width: '32px', height: '32px', borderRadius: '50%',
          background: '#EEF2FF',
          border: '1px solid rgba(79, 70, 229, 0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
          transition: 'all 200ms ease',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = '#E0E7FF'
          e.currentTarget.style.transform = 'scale(1.04)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = '#EEF2FF'
          e.currentTarget.style.transform = 'scale(1)'
        }}
        >
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4F46E5' }}>AK</span>
        </div>
      </div>
    </header>
  )
}
