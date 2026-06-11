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

      {/* ── Brand / Logo ─────────────────────────────────────────── */}
      <div style={{ padding: '0 0.5rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
        <div style={{
          width: '32px', height: '32px',
          background: 'linear-gradient(135deg, #2563EB 0%, #7C3AED 100%)',
          borderRadius: '0.5rem',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 900, fontSize: '1rem',
          boxShadow: '0 2px 8px rgba(37,99,235,0.35)',
          flexShrink: 0,
        }}>
          S
        </div>
        <div>
          <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--ink-1)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>SupplySense</div>
          <div style={{ fontSize: '0.5625rem', color: 'var(--ink-4)', fontWeight: 500, letterSpacing: '0.04em', marginTop: '1px' }}>AI Supply Chain · v0.5.0</div>
        </div>
      </div>

      <SidebarSection label="Dashboard" />
      <SidebarLink to="/" icon={Icons.dashboard} label="Overview" end />

      <SidebarSection label="General" />
      <SidebarLink to="/risks" icon={Icons.risk} label="Analytics" badge={riskBadge} />
      <SidebarLink to="/companies" icon={Icons.companies} label="Suppliers" />
      <SidebarLink to="/alternate-suppliers" icon={Icons.alternates} label="Sales Report" />

      <SidebarSection label="AI" />
      <SidebarLink to="/advisor" icon={Icons.advisor} label="AI Advisor" />

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* ── Contributor Card ─────────────────────────────────────── */}
      <div style={{
        margin: '0.5rem 0',
        padding: '0.75rem',
        background: 'linear-gradient(135deg, #EFF6FF 0%, #F5F3FF 100%)',
        border: '1px solid #DBEAFE',
        borderRadius: '0.625rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.625rem',
      }}>
        <div style={{
          width: '30px', height: '30px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #2563EB, #7C3AED)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 700, fontSize: '0.75rem',
          flexShrink: 0,
        }}>
          NV
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--ink-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Naveen
          </div>
          <div style={{ fontSize: '0.5625rem', color: 'var(--ink-4)', marginTop: '1px' }}>UI / Frontend Dev</div>
        </div>
        <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
          <a
            href="https://github.com/navee"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '22px', height: '22px',
              color: 'var(--ink-3)',
              borderRadius: '0.25rem',
              transition: 'color 150ms',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = '#2563EB')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink-3)')}
            title="GitHub"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
          </a>
        </div>
      </div>

      <div style={{ height: '1px', background: 'var(--border)', margin: '0.5rem 0' }} />

      <SidebarSection label="Support" />
      <SidebarLink to="/settings" icon={Icons.settings} label="Settings" />
      <SidebarLink to="/help" icon={<svg width={16} height={16} viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.5"/><path d="M10 14.5v.5M10 7c0-1.5 2-1.5 2 0 0 1.5-2 1.5-2 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>} label="Help Center" />
    </aside>
  )
}
