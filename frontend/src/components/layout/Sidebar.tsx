import { NavLink } from 'react-router-dom'
import { useRiskAnalysis, useDisruptions } from '../../hooks/useQueries'

/* ── Icon primitives ────────────────────────────────────────────────── */
function Icon({ children, size = 16 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
      {children}
    </svg>
  )
}

const Icons = {
  dashboard: (
    <Icon>
      <rect x="2" y="2" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="11" y="2" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="2" y="11" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="11" y="11" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
    </Icon>
  ),
  risk: (
    <Icon>
      <path d="M10 2L17.5 15.5H2.5L10 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M10 8v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="10" cy="13" r="0.75" fill="currentColor"/>
    </Icon>
  ),
  companies: (
    <Icon>
      <path d="M3 17V7l7-4 7 4v10" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <rect x="8" y="12" width="4" height="5" rx="0.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M6 9.5h.5M9.5 9.5H10M13.5 9.5H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </Icon>
  ),
  alternates: (
    <Icon>
      <circle cx="5" cy="10" r="3" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="15" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="15" cy="15" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M8 9l4.5-3M8 11l4.5 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </Icon>
  ),
  advisor: (
    <Icon>
      <path d="M3 4h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H7l-4 3V5a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M7 9h6M7 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </Icon>
  ),
  settings: (
    <Icon>
      <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M10 2v1.5M10 16.5V18M2 10h1.5M16.5 10H18M4.1 4.1l1.1 1.1M14.8 14.8l1.1 1.1M4.1 15.9l1.1-1.1M14.8 5.2l1.1-1.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </Icon>
  ),
}

/* ── Badge pill ─────────────────────────────────────────────────────── */
function NavBadge({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <span style={{
      marginLeft: 'auto',
      minWidth: '18px',
      height: '18px',
      padding: '0 5px',
      borderRadius: '9px',
      background: '#DC2626',
      color: '#fff',
      fontSize: '0.5625rem',
      fontWeight: 700,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      lineHeight: 1,
    }}>
      {count > 99 ? '99+' : count}
    </span>
  )
}

/* ── Section separator ──────────────────────────────────────────────── */
function SidebarSection({ label }: { label: string }) {
  return (
    <div style={{
      padding: '0.75rem 0.75rem 0.25rem',
      fontSize: '0.625rem',
      fontWeight: 700,
      color: 'var(--ink-4)',
      textTransform: 'uppercase',
      letterSpacing: '0.1em',
    }}>
      {label}
    </div>
  )
}

/* ── Nav item ───────────────────────────────────────────────────────── */
function SidebarLink({
  to, icon, label, badge, end,
}: {
  to: string
  icon: React.ReactNode
  label: string
  badge?: number
  end?: boolean
}) {
  return (
    <NavLink
      to={to}
      end={end}
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        gap: '0.625rem',
        padding: '0.625rem 0.75rem',
        borderRadius: '0.5rem',
        fontSize: '0.8125rem',
        fontWeight: isActive ? 600 : 500,
        color: isActive ? 'var(--primary)' : 'var(--ink-3)',
        background: isActive ? '#EFF6FF' : 'transparent',
        border: `1px solid ${isActive ? '#BFDBFE' : 'transparent'}`,
        textDecoration: 'none',
        transition: 'all 150ms cubic-bezier(0.16,1,0.3,1)',
        cursor: 'pointer',
        lineHeight: 1,
      })}
      onMouseEnter={e => {
        const el = e.currentTarget
        if (!el.classList.contains('active')) {
          el.style.color = 'var(--ink-1)'
          el.style.background = 'var(--bg-hover)'
        }
      }}
      onMouseLeave={e => {
        const el = e.currentTarget
        if (!el.classList.contains('active')) {
          el.style.color = 'var(--ink-3)'
          el.style.background = 'transparent'
        }
      }}
    >
      {icon}
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {badge !== undefined && <NavBadge count={badge} />}
    </NavLink>
  )
}

/* ── Sidebar ────────────────────────────────────────────────────────── */
export function Sidebar() {
  const { data: risks } = useRiskAnalysis()
  const { data: disruptions } = useDisruptions()

  const criticalCount = (risks as any[] | undefined)?.filter((r: any) => r.risk_level === 'critical' || r.risk_level === 'high').length ?? 0
  const activeDisruptions = disruptions?.total_active ?? 0
  const riskBadge = Math.max(criticalCount, activeDisruptions)

  return (
    <aside style={{
      width: '240px',
      minWidth: '240px',
      background: 'var(--bg-sidebar)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      padding: '1.25rem 1rem',
      gap: '0.25rem',
      overflowY: 'auto',
      overflowX: 'hidden',
    }}>
      <div style={{ padding: '0 0.5rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <div style={{ width: '28px', height: '28px', background: 'var(--primary)', borderRadius: '0.375rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold' }}>
          S
        </div>
        <span style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--ink-1)', letterSpacing: '-0.02em' }}>SupplySense</span>
      </div>

      {/* ── Procurement Manager ── */}
      <SidebarSection label="Procurement Manager" />
      <SidebarLink to="/" icon={Icons.dashboard} label="Command Centre" end />
      <SidebarLink to="/risks" icon={Icons.risk} label="Risk Intelligence" badge={riskBadge} />

      {/* ── Supply Chain Analyst ── */}
      <SidebarSection label="Supply Chain Analyst" />
      <SidebarLink to="/companies" icon={Icons.companies} label="Supplier Network" />
      <SidebarLink to="/alternate-suppliers" icon={Icons.alternates} label="Alternate Suppliers" />
      <SidebarLink to="/data-integration" icon={
        <svg width={16} height={16} viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
          <rect x="2" y="3" width="6" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
          <rect x="12" y="3" width="6" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
          <rect x="7" y="12" width="6" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M5 8v2h10V8M10 10v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      } label="Data Integration" />

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      <div style={{ height: '1px', background: 'var(--border)', margin: '1rem 0' }} />

      {/* ── Category Manager / Config ── */}
      <SidebarSection label="Configuration" />
      <SidebarLink to="/settings" icon={Icons.settings} label="Risk Weights" />
      <SidebarLink to="/help" icon={<svg width={16} height={16} viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.5"/><path d="M10 14.5v.5M10 7c0-1.5 2-1.5 2 0 0 1.5-2 1.5-2 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>} label="Help" />
    </aside>
  )
}
