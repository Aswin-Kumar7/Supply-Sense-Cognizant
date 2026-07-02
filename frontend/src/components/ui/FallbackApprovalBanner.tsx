/**
 * FallbackApprovalBanner — displays when a strands_fallback_request SSE event arrives.
 * Shows which agent failed, the operation, the reason, and approve/deny buttons.
 * Auto-dismisses after user responds or after 60s timeout.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSSE } from '../../hooks/useSSE'
import { api } from '../../services/api'

interface FallbackRequest {
  request_id: string
  agent_name: string
  operation: string
  reason: string
  timestamp: string
}

export function FallbackApprovalBanner() {
  const { events } = useSSE({ eventTypes: ['strands_fallback_request'], maxEvents: 10 })
  const [activeRequests, setActiveRequests] = useState<FallbackRequest[]>([])
  const [respondingTo, setRespondingTo] = useState<Set<string>>(new Set())
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // Track new fallback requests from SSE events
  useEffect(() => {
    if (events.length === 0) return

    const latestEvent = events[0]
    const data = latestEvent.data as unknown as FallbackRequest
    if (!data?.request_id) return

    setActiveRequests((prev) => {
      // Avoid duplicates
      if (prev.some((r) => r.request_id === data.request_id)) return prev
      return [data, ...prev]
    })

    // Auto-dismiss after 60s
    const timer = setTimeout(() => {
      setActiveRequests((prev) => prev.filter((r) => r.request_id !== data.request_id))
      timersRef.current.delete(data.request_id)
    }, 60000)
    timersRef.current.set(data.request_id, timer)

    return () => {
      // Cleanup handled by dismiss
    }
  }, [events])

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => clearTimeout(timer))
    }
  }, [])

  const handleResponse = useCallback(async (requestId: string, approved: boolean) => {
    setRespondingTo((prev) => new Set(prev).add(requestId))
    try {
      await api.approveFallback(requestId, approved)
    } catch (err) {
      // Best effort — the backend may have already timed out
      console.warn('Fallback approval request failed:', err)
    }
    // Remove from active list
    setActiveRequests((prev) => prev.filter((r) => r.request_id !== requestId))
    setRespondingTo((prev) => {
      const next = new Set(prev)
      next.delete(requestId)
      return next
    })
    // Clear timer
    const timer = timersRef.current.get(requestId)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(requestId)
    }
  }, [])

  if (activeRequests.length === 0) return null

  return (
    <div style={{ position: 'relative', zIndex: 1000 }}>
      {activeRequests.map((req) => (
        <div
          key={req.request_id}
          style={{
            background: '#FFFBEB',
            border: '1px solid #FCD34D',
            borderRadius: '0.75rem',
            padding: '1rem 1.25rem',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          {/* Warning icon */}
          <div
            style={{
              fontSize: '1.5rem',
              flexShrink: 0,
            }}
          >
            ⚠️
          </div>

          {/* Content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                color: '#D29729',
                fontWeight: 500,
                fontSize: '0.875rem',
                marginBottom: '0.25rem',
              }}
            >
              Strands Agent Unavailable: {req.agent_name.replace(/_/g, ' ')}
            </div>
            <div
              style={{
                color: '#D29729',
                fontSize: '0.8125rem',
                lineHeight: 1.5,
              }}
            >
              <span style={{ color: '#B45309', fontWeight: 500 }}>Operation:</span> {req.operation}
              <br />
              <span style={{ color: '#B45309', fontWeight: 500 }}>Reason:</span> {req.reason}
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
            <button
              onClick={() => handleResponse(req.request_id, true)}
              disabled={respondingTo.has(req.request_id)}
              style={{
                padding: '0.5rem 0.875rem',
                borderRadius: '0.5rem',
                border: '1px solid #4A8B50',
                background: '#ECFDF5',
                color: '#4A8B50',
                fontSize: '0.8125rem',
                fontWeight: 500,
                cursor: respondingTo.has(req.request_id) ? 'not-allowed' : 'pointer',
                opacity: respondingTo.has(req.request_id) ? 0.5 : 1,
                transition: 'background 0.15s',
                fontFamily: 'inherit',
              }}
              onMouseEnter={e => { if (!respondingTo.has(req.request_id)) e.currentTarget.style.background = '#D1FAE5' }}
              onMouseLeave={e => { if (!respondingTo.has(req.request_id)) e.currentTarget.style.background = '#ECFDF5' }}
            >
              Approve Fallback
            </button>
            <button
              onClick={() => handleResponse(req.request_id, false)}
              disabled={respondingTo.has(req.request_id)}
              style={{
                padding: '0.5rem 0.875rem',
                borderRadius: '0.5rem',
                border: '1px solid #e06252',
                background: '#FEF2F2',
                color: '#c55b55',
                fontSize: '0.8125rem',
                fontWeight: 500,
                cursor: respondingTo.has(req.request_id) ? 'not-allowed' : 'pointer',
                opacity: respondingTo.has(req.request_id) ? 0.5 : 1,
                transition: 'background 0.15s',
                fontFamily: 'inherit',
              }}
              onMouseEnter={e => { if (!respondingTo.has(req.request_id)) e.currentTarget.style.background = '#FEE2E2' }}
              onMouseLeave={e => { if (!respondingTo.has(req.request_id)) e.currentTarget.style.background = '#FEF2F2' }}
            >
              Deny
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
