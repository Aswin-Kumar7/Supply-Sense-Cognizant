import { Outlet, useLocation } from 'react-router-dom'
import { useRef, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { TopBar } from './TopBar'
import { Sidebar } from './Sidebar'
import { FallbackApprovalBanner } from '../ui/FallbackApprovalBanner'
import { FloatingChatWidget } from '../ui/FloatingChatWidget'
import { useSSECacheInvalidation } from '../../hooks/useSSECacheInvalidation'
import { useGlobalSync, GlobalSyncContext } from '../../hooks/useGlobalSync'
import { api } from '../../services/api'
import { queryKeys } from '../../hooks/queryKeys'

export function DashboardLayout() {
  useSSECacheInvalidation()
  const sync = useGlobalSync()
  const queryClient = useQueryClient()
  const location = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTop = 0
    }
  }, [location.pathname])

  useEffect(() => {
    api.syncRisks().then(({ synced }) => {
      if (synced > 0) queryClient.invalidateQueries({ queryKey: queryKeys.actionCards })
    }).catch(() => {})
  }, [queryClient])

  return (
    <GlobalSyncContext.Provider value={sync}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: 'var(--bg-app)' }}>
        <TopBar />
        
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
        <FloatingChatWidget />
      </div>
    </GlobalSyncContext.Provider>
  )
}
