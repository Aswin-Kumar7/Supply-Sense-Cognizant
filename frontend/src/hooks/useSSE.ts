/**
 * Hook for subscribing to SSE events with type filtering.
 * Provides reactive event state for dashboard panels.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { SSEEvent } from '../types'
import { sseService, ConnectionStatus } from '../services/sse'

interface UseSSEOptions {
  /** Filter events by type (e.g., 'disruption_alert') */
  eventTypes?: string[]
  /** Max events to keep in state */
  maxEvents?: number
}

interface UseSSEResult {
  events: SSEEvent[]
  latestEvent: SSEEvent | null
  connectionStatus: ConnectionStatus
  eventCount: number
  clearEvents: () => void
}

export function useSSE(options: UseSSEOptions = {}): UseSSEResult {
  const { eventTypes, maxEvents = 20 } = options
  const [events, setEvents] = useState<SSEEvent[]>([])
  const [latestEvent, setLatestEvent] = useState<SSEEvent | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected')
  const [eventCount, setEventCount] = useState(0)
  const eventTypesRef = useRef(eventTypes)
  eventTypesRef.current = eventTypes

  useEffect(() => {
    // Subscribe to events
    const unsubEvent = sseService.subscribe((event: SSEEvent) => {
      // Apply type filter
      if (eventTypesRef.current && !eventTypesRef.current.includes(event.event_type)) {
        return
      }

      setLatestEvent(event)
      setEventCount(c => c + 1)
      setEvents(prev => {
        const next = [event, ...prev]
        return next.slice(0, maxEvents)
      })
    })

    // Subscribe to status
    const unsubStatus = sseService.onStatusChange(setConnectionStatus)

    // Load history on mount
    const history = eventTypes
      ? sseService.getHistory().filter(e => eventTypes.includes(e.event_type))
      : sseService.getHistory()
    setEvents(history.slice(0, maxEvents))

    return () => {
      unsubEvent()
      unsubStatus()
    }
  }, [maxEvents])

  const clearEvents = useCallback(() => {
    setEvents([])
    setEventCount(0)
    setLatestEvent(null)
  }, [])

  return { events, latestEvent, connectionStatus, eventCount, clearEvents }
}
