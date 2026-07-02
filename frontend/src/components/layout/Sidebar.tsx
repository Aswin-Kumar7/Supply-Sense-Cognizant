import { useMemo, useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { useDisruptions, useActionCards, useProcurementCards } from '../../hooks/useQueries'
import { useWeightedRiskAnalysis } from '../../hooks/useRiskWeights'
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
  ChevronsLeft,
} from 'lucide-react'
import type { IntelligentActionCard } from '../../types'

function NavBadge({ count, collapsed }: { count: number; collapsed: boolean }) {
  if (count === 0 || collapsed) return null
  return (
    <span style={{
      marginLeft: 'auto',
      minWidth: '18px', height: '16px', padding: '0 5px',
      borderRadius: '10px',
      background: 'rgba(239, 68, 68, 0.08)',
      color: '#EF4444',
      border: '1px solid rgba(239, 68, 68, 0.15)',
      fontSize: '0.625rem', fontWeight: 600,
      fontVariantNumeric: 'tabular-nums',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      lineHeight: 1,
    }}>
      {count > 99 ? '99+' : count}
    </span>
  )
}

function SidebarSection({ label, collapsed }: { label: string; collapsed: boolean }) {
  if (collapsed) return null
  return (
    <div style={{
      padding: '18px 16px 5px',
      fontSize: '0.625rem', fontWeight: 700,
      color: '#94A3B8',
      textTransform: 'uppercase',
      letterSpacing: '0.1em',
    }}>
      {label}
    </div>
  )
}

function SidebarLink({
  to, icon: Icon, label, badge, end, collapsed
}: {
  to: string; icon: any; label: string; badge?: number; end?: boolean; collapsed: boolean
}) {
  return (
    <NavLink
      to={to}
      end={end}
      title={collapsed ? label : undefined}
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        gap: collapsed ? '0' : '8px',
        padding: collapsed ? '7px' : isActive ? '7px 10px 7px 7px' : '7px 10px',
        fontSize: '0.8125rem',
        fontWeight: isActive ? 600 : 400,
        color: isActive ? '#0F172A' : '#64748B',
        background: isActive ? '#F1F5F9' : 'transparent',
        borderLeft: isActive ? '3px solid #0F172A' : '3px solid transparent',
        borderRadius: isActive ? '0 6px 6px 0' : '6px',
        textDecoration: 'none',
        transition: 'all 120ms ease',
        cursor: 'pointer',
        lineHeight: 1,
        width: collapsed ? '36px' : 'auto',
        margin: collapsed ? '1px auto' : '1px 8px',
      })}
    >
      {({ isActive }) => (
        <>
          <Icon size={16} strokeWidth={isActive ? 1.75 : 1.25} style={{ flexShrink: 0, color: isActive ? '#0F172A' : '#94A3B8' }} />
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

export function Sidebar({ collapsed, setCollapsed }: { collapsed: boolean; setCollapsed: (c: boolean) => void }) {
  const { data: disruptions } = useDisruptions()
  const { data: actionData } = useActionCards()
  const { data: risks } = useWeightedRiskAnalysis()
  const { data: procCards } = useProcurementCards()

  const procCardMap = useMemo(
    () => new Map((procCards as IntelligentActionCard[] ?? []).map(c => [c.supplier_id, c])),
    [procCards]
  )

  const resolvedSupplierIds = useMemo(() => {
    const bySupplier = new Map<string, { resolved: number; total: number }>()
    for (const c of actionData?.action_cards ?? []) {
      if (!c.supplier_id) continue
      const entry = bySupplier.get(c.supplier_id) ?? { resolved: 0, total: 0 }
      entry.total++
      if (c.is_resolved) entry.resolved++
      bySupplier.set(c.supplier_id, entry)
    }
    return new Set(
      [...bySupplier.entries()]
        .filter(([, { resolved, total }]) => total > 0 && resolved === total)
        .map(([id]) => id)
    )
  }, [actionData])

  const activeSupplierCount = useMemo(() => {
    const riskList = (risks as any[] | undefined) ?? []
    return riskList.filter(r => {
      if (resolvedSupplierIds.has(r.supplier_id)) return false
      if (r.risk_level === 'low') return false
      const card = procCardMap.get(r.supplier_id)
      if (!card || (card as IntelligentActionCard).financial_exposure_inr === 0) return false
      return true
    }).length
  }, [risks, resolvedSupplierIds, procCardMap])

  const riskBadge = activeSupplierCount
  const pendingActions = activeSupplierCount

  const [readIds, setReadIds] = useState<Set<string>>(() => {
    try {
      const s = localStorage.getItem('ss_read_disruptions')
      return s ? new Set(JSON.parse(s) as string[]) : new Set<string>()
    } catch { return new Set<string>() }
  })

  useEffect(() => {
    const handleStorage = () => {
      try {
        const s = localStorage.getItem('ss_read_disruptions')
        setReadIds(s ? new Set(JSON.parse(s) as string[]) : new Set<string>())
      } catch { setReadIds(new Set<string>()) }
    }
    window.addEventListener('storage', handleStorage)
    window.addEventListener('ss_read_disruptions_changed', handleStorage)
    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('ss_read_disruptions_changed', handleStorage)
    }
  }, [])

  const activeDisruptions = (disruptions?.disruptions ?? [])
    .filter((d: any) => d.is_active && d.severity !== 'low' && !readIds.has(d.id)).length

  return (
    <aside style={{
      width: collapsed ? '56px' : '220px',
      minWidth: collapsed ? '56px' : '220px',
      background: '#FFFFFF',
      borderRight: '1px solid #E2E8F0',
      display: 'flex',
      flexDirection: 'column',
      padding: '6px 0',
      transition: 'width 200ms ease, min-width 200ms ease',
      overflowY: 'auto',
      overflowX: 'hidden',
    }}>
      <style>{`
        .sb-link a:hover { 
          background: #F8FAFC !important; 
          color: #0F172A !important;
        }
        .sb-link a.active:hover {
          background: #F1F5F9 !important;
        }
        .sb-toggle:hover { background: #F8FAFC !important; color: #0F172A !important; }
      `}</style>

      <div style={{
        display: 'flex',
        justifyContent: collapsed ? 'center' : 'flex-end',
        padding: collapsed ? '2px 0 6px' : '2px 10px 6px',
      }}>
        <button
          className="sb-toggle"
          onClick={() => setCollapsed(!collapsed)}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: '#94A3B8', padding: '5px', borderRadius: '5px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 120ms ease, color 120ms ease',
          }}
        >
          {collapsed ? <Menu size={16} /> : <ChevronsLeft size={16} />}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', flex: 1 }}>
        <SidebarSection label="Home" collapsed={collapsed} />
        <div className="sb-link"><SidebarLink to="/" icon={LayoutDashboard} label="Dashboard" end collapsed={collapsed} /></div>

        <SidebarSection label="Supply Chain" collapsed={collapsed} />
        <div className="sb-link"><SidebarLink to="/risks" icon={ShieldAlert} label="Risks" badge={riskBadge} collapsed={collapsed} /></div>
        <div className="sb-link"><SidebarLink to="/companies" icon={Building2} label="Suppliers" collapsed={collapsed} /></div>
        <div className="sb-link"><SidebarLink to="/alternate-suppliers" icon={ArrowLeftRight} label="Tier 2 Dependencies" collapsed={collapsed} /></div>
        <div className="sb-link"><SidebarLink to="/disruptions" icon={Activity} label="Disruptions" badge={activeDisruptions} collapsed={collapsed} /></div>
        <div className="sb-link"><SidebarLink to="/actions" icon={ClipboardList} label="Pending Actions" badge={pendingActions} collapsed={collapsed} /></div>
        <div className="sb-link"><SidebarLink to="/activity" icon={History} label="Activity Log" collapsed={collapsed} /></div>

        {!collapsed && <div style={{ margin: '10px 14px', height: '1px', background: '#E2E8F0' }} />}

        <SidebarSection label="App" collapsed={collapsed} />
        <div className="sb-link"><SidebarLink to="/settings" icon={Settings} label="Settings" collapsed={collapsed} /></div>
        <div className="sb-link"><SidebarLink to="/help" icon={HelpCircle} label="Help" collapsed={collapsed} /></div>
      </div>

      {!collapsed && (
        <div style={{ padding: '10px 16px', borderTop: '1px solid #E2E8F0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ 
              width: 6, height: 6, borderRadius: '50%', 
              background: '#10B981',
              boxShadow: '0 0 4px #10B981',
              animation: 'dash-pulse 2s ease-in-out infinite'
            }} />
            <span style={{ fontSize: '0.6875rem', color: '#64748B', fontWeight: 500 }}>
              System Live
            </span>
            <span style={{
              fontSize: '0.5625rem', color: '#CBD5E1',
              fontVariantNumeric: 'tabular-nums', marginLeft: 'auto',
            }}>
              v1.4.2
            </span>
          </div>
        </div>
      )}

      {collapsed && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0' }}>
          <div style={{ 
            width: 6, height: 6, borderRadius: '50%', 
            background: '#10B981',
            boxShadow: '0 0 4px #10B981',
            animation: 'dash-pulse 2s ease-in-out infinite'
          }} />
        </div>
      )}
    </aside>
  )
}
