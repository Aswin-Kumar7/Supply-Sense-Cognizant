import { Outlet, useLocation } from 'react-router-dom'
import { useRef, useEffect, useState } from 'react'
import { TopBar } from './TopBar'
import { Sidebar } from './Sidebar'
import { FallbackApprovalBanner } from '../ui/FallbackApprovalBanner'
import { useSSECacheInvalidation } from '../../hooks/useSSECacheInvalidation'
import { useGlobalSync, GlobalSyncContext } from '../../hooks/useGlobalSync'

export function DashboardLayout() {
  useSSECacheInvalidation()
  const sync = useGlobalSync()
  const location = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTop = 0
    }
  }, [location.pathname])

  return (
    <GlobalSyncContext.Provider value={sync}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: 'var(--bg-app)' }}>
        <TopBar collapsed={collapsed} setCollapsed={setCollapsed} />
        
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
          <main
            ref={mainRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              overflowX: 'hidden',
              padding: '2rem',
            }}
          >
            <FallbackApprovalBanner />
            <Outlet />
          </main>
        </div>
      </div>
    </GlobalSyncContext.Provider>
  )
}
