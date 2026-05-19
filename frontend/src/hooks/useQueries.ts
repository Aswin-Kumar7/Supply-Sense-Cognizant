import { useQuery } from '@tanstack/react-query'
import { api } from '../services/api'
import { queryKeys, staleTimes } from './queryKeys'
import { concurrencyLimitedFetch } from '../App'
import { DEFAULT_BUFFER_MS } from './useGlobalSync'

const STORAGE_KEY_BUFFER = 'ss_cache_buffer_ms'
function getBufferMs() {
  const raw = localStorage.getItem(STORAGE_KEY_BUFFER)
  const parsed = raw ? parseInt(raw, 10) : NaN
  return Number.isFinite(parsed) ? parsed : DEFAULT_BUFFER_MS
}

export function useDashboardSummary() {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: () => concurrencyLimitedFetch(() => api.getDashboardSummary()),
    staleTime: staleTimes.realtime,
  })
}

export function useSuppliers() {
  return useQuery({
    queryKey: queryKeys.suppliers,
    queryFn: () => concurrencyLimitedFetch(() => api.getSuppliers()),
    staleTime: staleTimes.static,
  })
}

export function useDisruptions() {
  return useQuery({
    queryKey: queryKeys.disruptions,
    queryFn: () => concurrencyLimitedFetch(() => api.getDisruptionTimeline()),
    staleTime: staleTimes.realtime,
  })
}

export function useRiskAnalysis() {
  return useQuery({
    queryKey: queryKeys.risk('all'),
    queryFn: () => concurrencyLimitedFetch(() => api.getSupplierRisks()),
    staleTime: staleTimes.computed,
  })
}

// Re-export weighted version so callers can use either
export { useWeightedRiskAnalysis } from './useRiskWeights'

export function useFinancialSummary() {
  return useQuery({
    queryKey: queryKeys.financial,
    queryFn: () => concurrencyLimitedFetch(() => api.getFinancialExposure()),
    staleTime: staleTimes.computed,
  })
}

export function useStockoutForecast() {
  return useQuery({
    queryKey: queryKeys.stockout,
    queryFn: () => concurrencyLimitedFetch(() => api.getStockoutForecasts()),
    staleTime: staleTimes.computed,
  })
}

export function useProcurementCards() {
  const bufferMs = getBufferMs()
  return useQuery({
    queryKey: queryKeys.procurement,
    queryFn: () => concurrencyLimitedFetch(() => api.getIntelligentActionCards()),
    staleTime: bufferMs,
  })
}

export function useSKUs() {
  return useQuery({
    queryKey: queryKeys.skus,
    queryFn: () => concurrencyLimitedFetch(() => api.getSKUs()),
    staleTime: staleTimes.realtime,
  })
}

export function useExecutiveBrief() {
  const bufferMs = getBufferMs()
  return useQuery({
    queryKey: queryKeys.executiveBrief,
    queryFn: () => concurrencyLimitedFetch(() => api.getExecutiveBrief()),
    staleTime: bufferMs,
    refetchInterval: bufferMs,
  })
}

export function useActionCards() {
  return useQuery({
    queryKey: queryKeys.actionCards,
    queryFn: () => concurrencyLimitedFetch(() => api.getActionCards()),
    staleTime: staleTimes.realtime,
    refetchInterval: 30_000,
  })
}

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => api.getHealth(),
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: false,
  })
}

