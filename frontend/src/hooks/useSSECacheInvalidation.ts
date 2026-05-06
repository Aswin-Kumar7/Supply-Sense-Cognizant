/**
 * Hook for SSE-driven React Query cache invalidation.
 * Subscribes to SSE events and invalidates relevant query caches
 * when data-change events arrive, triggering background refetches.
 *
 * Should be called once at the layout/app level.
 *
 * Validates: Requirements 4.3
 */

import { useEffect, useRef } from 'react'
import { useQueryClient, QueryClient } from '@tanstack/react-query'
import { SSEEvent } from '../types'
import { sseService } from '../services/sse'
import { queryKeys } from './queryKeys'

/**
 * Maps SSE event types to the query keys that should be invalidated.
 * When an event of a given type arrives, all mapped query keys are invalidated,
 * triggering background refetches for any active queries using those keys.
 */
const EVENT_TO_QUERY_KEYS: Record<string, readonly (readonly string[])[]> = {
  disruption_alert: [queryKeys.disruptions],
  risk_update: [queryKeys.risk('all'), queryKeys.financial],
  action_card: [queryKeys.procurement],
  stockout_warning: [queryKeys.stockout],
  supplier_update: [queryKeys.suppliers],
  dashboard_update: [queryKeys.dashboard],
}

/**
 * Invalidates query caches based on an incoming SSE event type.
 */
function invalidateForEvent(queryClient: QueryClient, event: SSEEvent): void {
  const keysToInvalidate = EVENT_TO_QUERY_KEYS[event.event_type]
  if (!keysToInvalidate) return

  for (const queryKey of keysToInvalidate) {
    queryClient.invalidateQueries({ queryKey: [...queryKey] })
  }
}

/**
 * Hook that subscribes to SSE events and invalidates relevant React Query
 * caches when data-change events arrive. This triggers background refetches
 * for any components currently using those queries.
 *
 * Call this once in a top-level layout component (e.g., DashboardLayout).
 */
export function useSSECacheInvalidation(): void {
  const queryClient = useQueryClient()
  const queryClientRef = useRef(queryClient)
  queryClientRef.current = queryClient

  useEffect(() => {
    const unsubscribe = sseService.subscribe((event: SSEEvent) => {
      invalidateForEvent(queryClientRef.current, event)
    })

    return unsubscribe
  }, [])
}
