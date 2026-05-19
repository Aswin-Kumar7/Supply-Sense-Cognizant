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
  SimulateMitigationResponse,
  HealthStatus,
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
  getSupplierRiskHistory: (id: string, days = 30) =>
    request<{ supplier_id: string; days: number; count: number; history: { date: string; risk_score: number; risk_level: string }[] }>(
      `/risk/suppliers/${id}/history?days=${days}`
    ),
  getCascadeAnalysis: (id: string) => request<CascadeAnalysis>(`/risk/cascade/${id}`),
  getStockoutForecasts: () => request<StockoutSummary>('/risk/stockout'),
  getFinancialExposure: () => request<FinancialSummary>('/risk/financial'),
  getMitigationSimulation: (id: string) => request<MitigationSimulation>(`/risk/mitigation/${id}`),

  // Procurement Intelligence
  getIntelligentActionCards: (ttlSeconds?: number) =>
    request<IntelligentActionCard[]>(`/procurement/action-cards${ttlSeconds ? `?ttl_seconds=${ttlSeconds}` : ''}`),
  getExecutiveBrief: (ttlSeconds?: number) =>
    request<ExecutiveBrief>(`/procurement/executive-brief${ttlSeconds ? `?ttl_seconds=${ttlSeconds}` : ''}`),
  getAlternateSuppliers: (id: string) =>
    request<any>(`/procurement/alternate-suppliers/${id}`),

  // Mitigation simulation
  simulateMitigationAction: (supplierId: string) =>
    request<SimulateMitigationResponse>('/actions/simulate-mitigation', {
      method: 'POST',
      body: JSON.stringify({ supplier_id: supplierId }),
    }),

  // Chat
  sendChatMessage: (message: string, sessionId?: string | null) =>
    request<ChatResponse>('/chat', {
      method: 'POST',
      body: JSON.stringify({ message, session_id: sessionId ?? null }),
    }),

  // Health
  getHealth: () => request<HealthStatus>('/health'),

  // Agent fallback (used by FallbackApprovalBanner in DashboardLayout)
  approveFallback: (requestId: string, approved: boolean) =>
    request<{ status: string; request_id: string }>('/agents/fallback/approve', {
      method: 'POST',
      body: JSON.stringify({ request_id: requestId, approved }),
    }),
}
