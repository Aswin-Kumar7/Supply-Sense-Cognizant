import React, { Suspense } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import { DashboardLayout } from './components/layout/DashboardLayout'
import { RouteErrorBoundary } from './components/ui/RouteErrorBoundary'
import { RouteLoadingSkeleton } from './components/ui/RouteLoadingSkeleton'

// Lazy-loaded pages
const DashboardPage          = React.lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })))
const RisksPage              = React.lazy(() => import('./pages/RisksPage'))
const RiskDetailPage         = React.lazy(() => import('./pages/RiskDetailPage'))
const RiskMitigationPlan     = React.lazy(() => import('./pages/RiskMitigationPlan'))
const CompaniesPage          = React.lazy(() => import('./pages/CompaniesPage'))
const CompanyDetailPage      = React.lazy(() => import('./pages/CompanyDetailPage'))
const AlternateSuppliersPage = React.lazy(() => import('./pages/AlternateSuppliersPage'))
const AIAdvisor              = React.lazy(() => import('./pages/AIAdvisor'))
const SettingsPage           = React.lazy(() => import('./pages/SettingsPage'))

function LazyRoute({ children }: { children: React.ReactNode }) {
  return (
    <RouteErrorBoundary>
      <Suspense fallback={<RouteLoadingSkeleton />}>
        {children}
      </Suspense>
    </RouteErrorBoundary>
  )
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <DashboardLayout />,
    children: [
      {
        index: true,
        element: <LazyRoute><DashboardPage /></LazyRoute>,
      },
      {
        path: 'risks',
        element: <LazyRoute><RisksPage /></LazyRoute>,
      },
      {
        path: 'risks/:id',
        element: <LazyRoute><RiskDetailPage /></LazyRoute>,
      },
      {
        path: 'risks/:id/mitigation',
        element: <LazyRoute><RiskMitigationPlan /></LazyRoute>,
      },
      {
        path: 'companies',
        element: <LazyRoute><CompaniesPage /></LazyRoute>,
      },
      {
        path: 'companies/:id',
        element: <LazyRoute><CompanyDetailPage /></LazyRoute>,
      },
      {
        path: 'alternate-suppliers',
        element: <LazyRoute><AlternateSuppliersPage /></LazyRoute>,
      },
      {
        path: 'advisor',
        element: <LazyRoute><AIAdvisor /></LazyRoute>,
      },
      {
        path: 'settings',
        element: <LazyRoute><SettingsPage /></LazyRoute>,
      },
    ],
  },
])
