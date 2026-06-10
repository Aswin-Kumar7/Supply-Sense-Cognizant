import { useMemo } from 'react'
import { NavLink } from 'react-router-dom'
import { useDisruptions, useActionCards } from '../../hooks/useQueries'
import {
  LayoutDashboard,
  ShieldAlert,
  Building2,
  ArrowLeftRight,
  Settings,
  HelpCircle,
  Activity,
  Menu,
  ClipboardList,
  History,
  MessageSquare,
} from 'lucide-react'

/* ── Badge pill ─────────────────────────────────────────────────────── */
function NavBadge({ count, collapsed }: { count: number, collapsed: boolean }) {
  if (count === 0 || collapsed) return null
  return (
    <span style={{
      marginLeft: 'auto',
      minWidth: '18px',
      height: '18px',
      padding: '0 5px',
      borderRadius: '4px',
      background: '#000',
      color: '#fff',
      fontSize: '0.625rem',
      fontWeight: 700,
      fontFamily: 'JetBrains Mono, monospace',
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
function SidebarSection({ label, collapsed }: { label: string, collapsed: boolean }) {
  if (collapsed) return null
  return (
    <div style={{
      padding: '1.25rem 0.75rem 0.5rem',
      fontSize: '0.625rem',
      fontWeight: 700,
      color: 'var(--ink-4)',
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
    }}>
      {label}
    </div>
  )
}

/* ── Nav item ───────────────────────────────────────────────────────── */
function SidebarLink({
  to, icon: Icon, label, badge, end, collapsed
}: {
  to: string
  icon: any
  label: string
  badge?: number
  end?: boolean
  collapsed: boolean
}) {
  return (
    <NavLink
      to={to}
      end={end}
      title={collapsed ? label : undefined}
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: collapsed ? '0' : '0.75rem',
        padding: '0.625rem',
        borderRadius: '8px',
        fontSize: '0.8125rem',
        fontWeight: isActive ? 600 : 500,
        color: isActive ? '#fff' : 'var(--ink-3)',
        background: isActive ? '#000' : 'transparent',
        textDecoration: 'none',
        transition: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
        cursor: 'pointer',
        lineHeight: 1,
        width: collapsed ? '44px' : '100%',
        margin: collapsed ? '0 auto' : '0',
      })}
    >
      {({ isActive }) => (
        <>
          <Icon size={20} strokeWidth={isActive ? 2.5 : 2} style={{ flexShrink: 0 }} />
          {!collapsed && (
            <>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
              {badge !== undefined && <NavBadge count={badge} collapsed={collapsed} />}
            </>
          )}
        </>
      )}
    </NavLink>
  )
}

/* ── Sidebar ────────────────────────────────────────────────────────── */
export function Sidebar({ collapsed, setCollapsed }: { collapsed: boolean, setCollapsed: (c: boolean) => void }) {
  const { data: disruptions } = useDisruptions()
  const { data: actionData } = useActionCards()

  // Derive badge purely from actionCards — same source as PendingActionsPage and RisksPage filter.
  // Count unique supplier_ids that have at least one unresolved card with non-low priority.
  // This is the single source of truth and avoids any stale-time race with the risk query.
  const riskBadge = useMemo(() => {
    const activeSuppliers = new Set<string>()
    for (const c of actionData?.action_cards ?? []) {
      if (!c.supplier_id || c.is_resolved) continue
      if (c.estimated_impact_inr === 0) continue
      if (['critical', 'high', 'medium'].includes(c.priority)) {
        activeSuppliers.add(c.supplier_id)
      }
    }
    return activeSuppliers.size
  }, [actionData])

  // Only unread active disruptions count as notifications
  const readIds = useMemo(() => {
    try {
      const s = localStorage.getItem('ss_read_disruptions')
      return s ? new Set(JSON.parse(s) as string[]) : new Set<string>()
    } catch { return new Set<string>() }
  }, [])
  const activeDisruptions = (disruptions?.disruptions ?? [])
    .filter((d: any) => d.is_active && d.severity !== 'low' && !readIds.has(d.id)).length
  const pendingActions = actionData?.unresolved ?? 0

  return (
    <aside style={{
      width: collapsed ? '72px' : '260px',
      minWidth: collapsed ? '72px' : '260px',
      background: '#fff',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      padding: collapsed ? '1.5rem 0' : '1.5rem 1rem',
      transition: 'width 300ms cubic-bezier(0.4, 0, 0.2, 1)',
      overflowY: 'auto',
      overflowX: 'hidden',
    }}>
      {/* Sidebar Toggle Button */}
      <div style={{ 
        display: 'flex', 
        justifyContent: collapsed ? 'center' : 'flex-start', 
        padding: collapsed ? '0 0 1rem' : '0 0.75rem 0.75rem',
        marginBottom: '0.25rem'
      }}>
        <button 
          onClick={() => setCollapsed(!collapsed)}
          style={{ 
            background: 'none', border: 'none', cursor: 'pointer', color: '#000', 
            padding: '8px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}
        >
          <Menu size={20} />
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: collapsed ? '1.25rem' : '0.125rem' }}>
        <SidebarSection label="Home" collapsed={collapsed} />
        <SidebarLink to="/" icon={LayoutDashboard} label="Dashboard" end collapsed={collapsed} />

        <SidebarSection label="Supply Chain" collapsed={collapsed} />
        <SidebarLink to="/risks" icon={ShieldAlert} label="Risks" badge={riskBadge} collapsed={collapsed} />
        <SidebarLink to="/companies" icon={Building2} label="Suppliers" collapsed={collapsed} />
        <SidebarLink to="/alternate-suppliers" icon={ArrowLeftRight} label="Backup Suppliers" collapsed={collapsed} />
        <SidebarLink to="/disruptions" icon={Activity} label="Disruptions" badge={activeDisruptions} collapsed={collapsed} />
        <SidebarLink to="/actions" icon={ClipboardList} label="Pending Actions" badge={pendingActions} collapsed={collapsed} />
        <SidebarLink to="/activity" icon={History} label="Activity Log" collapsed={collapsed} />
        <SidebarLink to="/advisor" icon={MessageSquare} label="AI Advisor" collapsed={collapsed} />

        {!collapsed && <div style={{ margin: '1.5rem 0.5rem 0', height: '1px', background: 'var(--border)' }} />}

        <SidebarSection label="App" collapsed={collapsed} />
        <SidebarLink to="/settings" icon={Settings} label="Settings" collapsed={collapsed} />
        <SidebarLink to="/help" icon={HelpCircle} label="Help" collapsed={collapsed} />
      </div>

      {/* Footer Status */}
      {!collapsed && (
        <div style={{ marginTop: 'auto', paddingTop: '1.5rem' }}>
          <div style={{ 
            padding: '1rem', background: 'var(--bg-hover)', borderRadius: '8px', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: '0.75rem'
          }}>
            <div style={{ 
              width: '8px', height: '8px', borderRadius: '50%', background: '#16a34a', 
              boxShadow: '0 0 0 3px rgba(22,163,74,0.1)'
            }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#000' }}>System Live</span>
              <span style={{ fontSize: '0.625rem', color: 'var(--ink-4)', fontWeight: 500 }}>V1.4.2 Connected</span>
            </div>
            <Activity size={14} color="var(--ink-4)" style={{ marginLeft: 'auto' }} />
          </div>
        </div>
      )}
    </aside>
  )
}
