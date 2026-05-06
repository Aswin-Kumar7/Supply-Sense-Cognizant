/**
 * Enhanced SSE Service for SupplySense.
 *
 * Architecture:
 * - Single EventSource connection shared across all components
 * - Event store maintains recent history for UI rendering
 * - Type-based filtering for panel-specific subscriptions
 * - Auto-reconnect with exponential backoff
 * - Connection status tracking for UI indicators
 */

import { SSEEvent } from '../types'

const SSE_URL = import.meta.env.VITE_SSE_URL || 'http://localhost:8000/api/v1/events/stream'

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'
export type EventHandler = (event: SSEEvent) => void
export type StatusHandler = (status: ConnectionStatus) => void

const MAX_EVENT_HISTORY = 50

class SSEService {
  private eventSource: EventSource | null = null
  private handlers: Set<EventHandler> = new Set()
  private statusHandlers: Set<StatusHandler> = new Set()
  private eventHistory: SSEEvent[] = []
  private status: ConnectionStatus = 'disconnected'
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * Connect to the SSE stream. Idempotent - safe to call multiple times.
   */
  connect(): void {
    if (this.eventSource?.readyState === EventSource.OPEN) return

    this.setStatus('connecting')
    this.eventSource = new EventSource(SSE_URL)

    this.eventSource.onopen = () => {
      this.setStatus('connected')
      this.reconnectAttempts = 0
    }

    this.eventSource.onmessage = (event) => {
      try {
        const data: SSEEvent = JSON.parse(event.data)
        this.handleEvent(data)
      } catch {
        // Ignore keepalive comments and parse errors
      }
    }

    this.eventSource.onerror = () => {
      this.setStatus('error')
      this.eventSource?.close()
      this.scheduleReconnect()
    }
  }

  /**
   * Disconnect from the SSE stream.
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.eventSource?.close()
    this.eventSource = null
    this.setStatus('disconnected')
  }

  /**
   * Subscribe to all events. Returns unsubscribe function.
   */
  subscribe(handler: EventHandler): () => void {
    this.handlers.add(handler)
    // Auto-connect on first subscriber
    if (this.handlers.size === 1) this.connect()
    return () => {
      this.handlers.delete(handler)
      if (this.handlers.size === 0) this.disconnect()
    }
  }

  /**
   * Subscribe to connection status changes.
   */
  onStatusChange(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler)
    // Immediately emit current status
    handler(this.status)
    return () => { this.statusHandlers.delete(handler) }
  }

  /**
   * Get recent event history (for components mounting after events fired).
   */
  getHistory(): SSEEvent[] {
    return [...this.eventHistory]
  }

  /**
   * Get events filtered by type.
   */
  getHistoryByType(type: string): SSEEvent[] {
    return this.eventHistory.filter(e => e.event_type === type)
  }

  /**
   * Get current connection status.
   */
  getStatus(): ConnectionStatus {
    return this.status
  }

  private handleEvent(event: SSEEvent): void {
    // Add to history (bounded)
    this.eventHistory.unshift(event)
    if (this.eventHistory.length > MAX_EVENT_HISTORY) {
      this.eventHistory.pop()
    }
    // Notify all handlers
    this.handlers.forEach(handler => handler(event))
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status
    this.statusHandlers.forEach(handler => handler(status))
  }

  private scheduleReconnect(): void {
    // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000)
    this.reconnectAttempts++
    this.setStatus('disconnected')

    this.reconnectTimer = setTimeout(() => {
      this.connect()
    }, delay)
  }
}

// Singleton instance - shared across all components
export const sseService = new SSEService()
