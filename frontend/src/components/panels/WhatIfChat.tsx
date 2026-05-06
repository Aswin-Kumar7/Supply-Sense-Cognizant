import { useState, useRef, useEffect, useCallback } from 'react'
import { api } from '../../services/api'
import type { HealthStatus } from '../../types'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  sources?: string[]
  timestamp: string   // ISO string — safe for sessionStorage serialization
  isError?: boolean
}

const FMCG_STARTER_QUESTIONS = [
  'Which FMCG suppliers have active disruptions this week?',
  'What is total financial exposure for critical suppliers?',
  'Show me suppliers with reliability below 80%',
  'What happens if Sunrise Consumer Chennai is offline for 7 days?',
  'Which SKUs are at stockout risk within 14 days?',
]

/* ── Health status pill ──────────────────────────────────────────────── */
function HealthPill({ health, loading }: { health: HealthStatus | null; loading: boolean }) {
  if (loading) {
    return (
      <span style={{
        fontSize: '0.5625rem', padding: '2px 8px', borderRadius: '999px',
        background: 'var(--border-strong)', color: 'var(--ink-4)', fontWeight: 600,
      }}>
        Checking…
      </span>
    )
  }
  if (!health) {
    return (
      <span style={{
        fontSize: '0.5625rem', padding: '2px 8px', borderRadius: '999px',
        background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', fontWeight: 600,
      }}>
        ● Offline
      </span>
    )
  }

  const bedrock = health.bedrock === 'ok'
  const strands = health.strands_agents === 'ok'

  if (bedrock && strands) {
    return (
      <span style={{
        fontSize: '0.5625rem', padding: '2px 8px', borderRadius: '999px',
        background: '#F0FDF4', color: '#059669', border: '1px solid #BBF7D0', fontWeight: 600,
      }}>
        ● AI Ready
      </span>
    )
  }
  if (health.status === 'healthy' || health.database === 'ok') {
    return (
      <span style={{
        fontSize: '0.5625rem', padding: '2px 8px', borderRadius: '999px',
        background: '#FFFBEB', color: '#D97706', border: '1px solid #FDE68A', fontWeight: 600,
      }}>
        ◐ Fallback Mode
      </span>
    )
  }
  return (
    <span style={{
      fontSize: '0.5625rem', padding: '2px 8px', borderRadius: '999px',
      background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', fontWeight: 600,
    }}>
      ● Degraded
    </span>
  )
}

/* ── Typing indicator ────────────────────────────────────────────────── */
function TypingDots() {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
      <div style={{
        padding: '0.625rem 0.875rem', borderRadius: '10px', borderBottomLeftRadius: '3px',
        background: '#F8F9FB', border: '1px solid #DDE3ED',
        display: 'flex', gap: '4px', alignItems: 'center',
      }}>
        <span style={{ fontSize: '0.5rem', color: 'var(--ink-4)', marginRight: '4px' }}>AI Advisor</span>
        {[0, 150, 300].map(delay => (
          <span
            key={delay}
            style={{
              width: '5px', height: '5px', borderRadius: '50%',
              background: '#2563EB',
              display: 'inline-block',
              animation: `chatBounce 1.2s ${delay}ms ease-in-out infinite`,
            }}
          />
        ))}
      </div>
    </div>
  )
}

/* ── Message bubble ──────────────────────────────────────────────────── */
function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user'
  const time = new Date(msg.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
      <div style={{
        maxWidth: '82%',
        display: 'flex', flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        gap: '2px',
      }}>
        {!isUser && (
          <span style={{ fontSize: '0.5rem', color: '#2563EB', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginLeft: '2px' }}>
            AI Advisor
          </span>
        )}
        <div style={{
          padding: '0.625rem 0.75rem',
          borderRadius: '10px',
          fontSize: '0.6875rem',
          lineHeight: 1.65,
          ...(isUser
            ? {
                background: '#E8EFFE',
                border: '1px solid #C5D5FC',
                color: '#003087',
                borderBottomRightRadius: '3px',
              }
            : msg.isError
            ? {
                background: '#FEF2F2',
                border: '1px solid #FECACA',
                color: '#7F1D1D',
                borderBottomLeftRadius: '3px',
              }
            : {
                background: '#F8F9FB',
                border: '1px solid #DDE3ED',
                color: 'var(--ink-2)',
                borderBottomLeftRadius: '3px',
              }),
        }}>
          <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{msg.content}</p>
          {msg.sources && msg.sources.length > 0 && (
            <p style={{ fontSize: '0.5rem', color: 'var(--ink-4)', marginTop: '4px', marginBottom: 0 }}>
              Sources: {msg.sources.join(', ')}
            </p>
          )}
        </div>
        <span style={{ fontSize: '0.5rem', color: 'var(--ink-5)' }}>{time}</span>
      </div>
    </div>
  )
}

/* ── Determine error message from error type ─────────────────────────── */
function getErrorMessage(error: unknown, health: HealthStatus | null): string {
  if (error instanceof TypeError && (error as TypeError).message.includes('fetch')) {
    return '⚠️ Cannot reach the backend server. Please check that the API is running on port 8001.'
  }
  if (error instanceof Error && error.message.includes('403')) {
    return '🔒 Access denied. The AI model may be unavailable in your region or the API key needs updating.'
  }
  if (error instanceof Error && (error.message.includes('500') || error.message.includes('503'))) {
    if (health?.bedrock === 'unavailable') {
      return '🤖 AWS Bedrock is currently unavailable. The system is running in fallback mode — financial data is still available.'
    }
    return '⚠️ The AI service encountered an error. Please try again in a moment.'
  }
  if (health && health.status === 'unhealthy') {
    return '⚠️ The backend is reporting an unhealthy status. AI responses may be limited.'
  }
  return '⚠️ Unable to reach the AI advisor. Please check that the backend is running and try again.'
}

/* ── Storage key per context ─────────────────────────────────────────── */
function storageKey(context?: string) {
  return `whatifsense_${context ? context.replace(/\s+/g, '_').toLowerCase() : 'global'}`
}

/* ── WhatIfChat component ─────────────────────────────────────────────── */
export function WhatIfChat({ prefillContext }: { prefillContext?: string } = {}) {
  const STORAGE_KEY = storageKey(prefillContext)

  const greeting = prefillContext
    ? `Hello! I'm your AI supply chain advisor. Ask me what-if questions about **${prefillContext}** — or any supplier, risk, or scenario in the FMCG network.`
    : `Hello! I'm your AI supply chain advisor. Ask me about supplier risks, financial exposure, stockout scenarios, or run what-if simulations.`

  const initialMessages: ChatMessage[] = [
    { role: 'assistant', content: greeting, timestamp: new Date().toISOString() },
  ]

  // Load persisted messages from sessionStorage
  const loadPersistedState = () => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY)
      if (!raw) return { messages: initialMessages, sessionId: null }
      const parsed = JSON.parse(raw)
      return {
        messages: parsed.messages?.length ? parsed.messages : initialMessages,
        sessionId: parsed.sessionId ?? null,
      }
    } catch {
      return { messages: initialMessages, sessionId: null }
    }
  }

  const persisted = loadPersistedState()

  const [messages, setMessages] = useState<ChatMessage[]>(persisted.messages)
  const [sessionId, setSessionId] = useState<string | null>(persisted.sessionId)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [healthLoading, setHealthLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Health check on mount
  useEffect(() => {
    let cancelled = false
    api.getHealth()
      .then(h => { if (!cancelled) { setHealth(h); setHealthLoading(false) } })
      .catch(() => { if (!cancelled) { setHealth(null); setHealthLoading(false) } })
    return () => { cancelled = true }
  }, [])

  // Persist to sessionStorage whenever messages/session change
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ messages, sessionId }))
    } catch {
      // sessionStorage quota exceeded — ignore
    }
  }, [messages, sessionId, STORAGE_KEY])

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return
    const userMsg: ChatMessage = { role: 'user', content: text.trim(), timestamp: new Date().toISOString() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const data = await api.sendChatMessage(text.trim(), sessionId)
      if (!sessionId) setSessionId(data.session_id)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.answer,
        sources: data.sources,
        timestamp: new Date().toISOString(),
      }])
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: getErrorMessage(err, health),
        timestamp: new Date().toISOString(),
        isError: true,
      }])
    } finally {
      setLoading(false)
    }
  }, [loading, sessionId, health])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const resetSession = () => {
    const fresh: ChatMessage[] = [{ role: 'assistant', content: greeting, timestamp: new Date().toISOString() }]
    setMessages(fresh)
    setSessionId(null)
    setInput('')
    try { sessionStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
  }

  const showStarters = messages.length === 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* Header bar with health status */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '0.875rem',
        paddingBottom: '0.75rem',
        borderBottom: '1px solid #E2E8F0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--ink-1)' }}>What-If AI Advisor</span>
          <HealthPill health={health} loading={healthLoading} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {sessionId && (
            <span style={{ fontSize: '0.5625rem', color: 'var(--ink-4)', fontFamily: 'JetBrains Mono, monospace' }}>
              session: {sessionId.slice(0, 8)}
            </span>
          )}
          <button
            onClick={resetSession}
            style={{
              fontSize: '0.625rem', color: 'var(--ink-3)', background: 'var(--border-strong)',
              border: 'none', borderRadius: '0.375rem', cursor: 'pointer',
              padding: '3px 8px', fontFamily: 'inherit', fontWeight: 600,
            }}
            title="Clear conversation"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        style={{
          maxHeight: '300px',
          overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: '0.625rem',
          marginBottom: '0.875rem',
          paddingRight: '2px',
        }}
      >
        {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
        {loading && <TypingDots />}
        <div ref={bottomRef} />
      </div>

      {/* Starter questions */}
      {showStarters && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginBottom: '0.75rem' }}>
          {FMCG_STARTER_QUESTIONS.map(q => (
            <button
              key={q}
              onClick={() => sendMessage(q)}
              disabled={loading}
              style={{
                fontSize: '0.5625rem',
                padding: '0.25rem 0.625rem',
                borderRadius: '6px',
                background: '#F0F4FF',
                border: '1px solid #C5D5FC',
                color: '#2563EB',
                cursor: 'pointer',
                textAlign: 'left',
                lineHeight: 1.4,
                transition: 'background 150ms',
                fontFamily: 'inherit',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#E8EFFE')}
              onMouseLeave={e => (e.currentTarget.style.background = '#F0F4FF')}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Degraded mode notice */}
      {health && health.bedrock === 'unavailable' && !healthLoading && (
        <div style={{
          padding: '0.5rem 0.75rem', marginBottom: '0.625rem',
          background: '#FFFBEB', border: '1px solid #FDE68A',
          borderRadius: '0.5rem',
          fontSize: '0.6875rem', color: '#92400E',
          display: 'flex', alignItems: 'center', gap: '0.5rem',
        }}>
          <span>⚠️</span>
          <span>AWS Bedrock unavailable — responses will be limited. Financial and risk data still accessible.</span>
        </div>
      )}

      {/* Input row */}
      <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'flex-end' }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={loading ? 'AI is thinking…' : 'Ask about suppliers, risks, or run scenarios… (Enter to send)'}
          rows={2}
          disabled={loading}
          style={{
            flex: 1,
            resize: 'none',
            borderRadius: '8px',
            background: 'var(--bg-card)',
            border: '1px solid #DDE3ED',
            padding: '0.5rem 0.75rem',
            fontSize: '0.6875rem',
            color: 'var(--ink-1)',
            outline: 'none',
            transition: 'border-color 0.15s',
            opacity: loading ? 0.6 : 1,
            fontFamily: 'inherit',
          }}
          onFocus={e => { e.target.style.borderColor = '#2563EB' }}
          onBlur={e => { e.target.style.borderColor = '#DDE3ED' }}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={loading || !input.trim()}
          style={{
            padding: '0.5rem 1rem',
            background: loading || !input.trim() ? 'var(--border)' : '#2563EB',
            color: loading || !input.trim() ? 'var(--ink-4)' : '#fff',
            borderRadius: '8px',
            border: 'none',
            cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
            fontSize: '0.6875rem',
            fontWeight: 700,
            fontFamily: 'inherit',
            alignSelf: 'stretch',
            transition: 'background 150ms',
            minWidth: '56px',
          }}
        >
          {loading ? (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ animation: 'spin 0.8s linear infinite' }}>
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="20 10"/>
            </svg>
          ) : 'Send'}
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginTop: '0.375rem' }}>
        <span style={{ fontSize: '0.5625rem', color: 'var(--ink-5)' }}>
          Powered by AWS Strands Agents · claude-opus-4
        </span>
      </div>

    </div>
  )
}
