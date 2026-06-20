import type {
  DashboardSummary,
  SupplierListResponse,
  SKUListResponse,
  DisruptionTimelineResponse,
  ActionCardListResponse,
  SupplierRiskAnalysis,
  CascadeAnalysis,
  StockoutSummary,
  FinancialSummary,
  MitigationSimulation,
  IntelligentActionCard,
  ExecutiveBrief,
  AlternateSuppliersResponse,
  ChatResponse,
  HealthStatus,
  SupplierDependency,
} from '../types'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1'

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${endpoint}`
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })

  if (!response.ok) {
    throw new ApiError(response.status, `API Error: ${response.statusText}`)
  }

  return response.json()
}

export const api = {
  // Dashboard
  getDashboardSummary: () => request<DashboardSummary>('/dashboard/summary'),

  // Suppliers
  getSuppliers: (limit = 100, offset = 0) =>
    request<SupplierListResponse>(`/suppliers?limit=${limit}&offset=${offset}`),
  getAlternateSuppliersDirect: (supplierId: string) =>
    request<AlternateSuppliersResponse>(`/suppliers/${supplierId}/alternate-suppliers`),
  getAlternateSupplierDetail: (altSupplierId: string, primarySupplierId: string) =>
    request<any>(`/suppliers/alternate-detail/${altSupplierId}?primary_supplier_id=${primarySupplierId}`),

  // SKUs
  getSKUs: (limit = 100, offset = 0) =>
    request<SKUListResponse>(`/skus?limit=${limit}&offset=${offset}`),

  // Disruptions
  getDisruptionTimeline: () =>
    request<DisruptionTimelineResponse>('/disruptions/timeline'),

  // Action Cards
  getActionCards: () => request<ActionCardListResponse>('/actions'),

  // Risk Intelligence
  getSupplierRisks: () => request<SupplierRiskAnalysis[]>('/risk/suppliers'),
  getSupplierRisk: (id: string) => request<SupplierRiskAnalysis>(`/risk/suppliers/${id}`),
  getCascadeAnalysis: (id: string) => request<CascadeAnalysis>(`/risk/cascade/${id}`),
  getStockoutForecasts: () => request<StockoutSummary>('/risk/stockout'),
  getFinancialExposure: () => request<FinancialSummary>('/risk/financial'),
  getMitigationSimulation: (id: string) => request<MitigationSimulation>(`/risk/mitigation/${id}`),

  // Procurement Intelligence
  getIntelligentActionCards: (ttlSeconds?: number) =>
    request<IntelligentActionCard[]>(`/procurement/action-cards${ttlSeconds ? `?ttl_seconds=${ttlSeconds}` : ''}`),
  getExecutiveBrief: (ttlSeconds?: number) =>
    request<ExecutiveBrief>(`/procurement/executive-brief${ttlSeconds ? `?ttl_seconds=${ttlSeconds}` : ''}`),
  // Chat
  sendChatMessage: (message: string, sessionId?: string | null) =>
    request<ChatResponse>('/chat', {
      method: 'POST',
      body: JSON.stringify({ message, session_id: sessionId ?? null }),
    }),

  // Action card resolution
  // Fix 3: send null (not empty string) when no note — avoids polluting the DB audit trail
  resolveActionCard: (actionCardId: string, resolutionNote?: string) =>
    request<{ status: string; action_card_id: string }>(`/actions/${actionCardId}/resolve`, {
      method: 'PATCH',
      body: JSON.stringify({ resolution_note: resolutionNote?.trim() || null }),
    }),

  // Resolves ALL unresolved action cards for a supplier at once.
  // Use this from the mitigation plan page so that taking action on a supplier
  // immediately clears it from the dashboard and risks page.
  resolveAllSupplierCards: (supplierId: string, resolutionNote?: string) =>
    request<{ status: string; supplier_id: string; count: number }>(`/actions/resolve-supplier/${supplierId}`, {
      method: 'PATCH',
      body: JSON.stringify({ resolution_note: resolutionNote?.trim() || null }),
    }),

  unresolveActionCard: (actionCardId: string) =>
    request<{ status: string; action_card_id: string }>(`/actions/${actionCardId}/unresolve`, {
      method: 'PATCH',
    }),

  // Reopens ALL resolved action cards for a supplier at once.
  // Use this when toggling a resolved supplier back to pending.
  unresolveAllSupplierCards: (supplierId: string) =>
    request<{ status: string; supplier_id: string; count: number }>(`/actions/unresolve-supplier/${supplierId}`, {
      method: 'PATCH',
    }),

  // Syncs action cards with live risk data — creates cards for any medium/high/critical
  // supplier that doesn't already have an unresolved card. Idempotent.
  syncRisks: () =>
    request<{ synced: number; already_covered: number }>('/actions/sync-risks', { method: 'POST' }),

  // Supplier Dependencies
  getSupplierDependencies: () =>
    request<SupplierDependency[]>('/suppliers/dependencies/all'),

  // Health
  getHealth: () => request<HealthStatus>('/health'),

  // Agent fallback (used by FallbackApprovalBanner in DashboardLayout)
  approveFallback: (requestId: string, approved: boolean) =>
    request<{ status: string; request_id: string }>('/agents/fallback/approve', {
      method: 'POST',
      body: JSON.stringify({ request_id: requestId, approved }),
    }),
}
