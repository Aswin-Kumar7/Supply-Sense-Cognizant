import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Send, RotateCcw, Bot, ChevronRight } from 'lucide-react'
import { useRiskAnalysis, useDisruptions, useFinancialSummary, useActionCards } from '../hooks/useQueries'
import { api } from '../services/api'
import type { SupplierRiskAnalysis } from '../types'

/* ── Types ──────────────────────────────────────────────────────── */
interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: string[]
  isError?: boolean
  timestamp: Date
}

/* ── Helpers ────────────────────────────────────────────────────── */
function formatINR(n: number) {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)}Cr`
  if (n >= 100_000)    return `₹${(n / 100_000).toFixed(1)}L`
  if (n >= 1_000)      return `₹${(n / 1_000).toFixed(0)}K`
  return `₹${n.toFixed(0)}`
}

const RISK_COLORS: Record<string, string> = {
  critical: '#c55b55',
  high: '#D29729',
  medium: '#52bde0',
  low: '#4A8B50',
}

// Map backend tool/source names to readable labels
const SOURCE_LABELS: Record<string, string> = {
  supplier_data: 'Supplier Data',
  financial_summary: 'Financial Engine',
  scenario_analysis: 'Cascade Model',
  query_suppliers: 'Live Supplier DB',
  get_financial_summary: 'TFE Engine',
  run_scenario: 'Cascade Model',
  risk_intelligence: 'Risk Intelligence',
  disruption_data: 'Disruption Data',
  stockout_forecast: 'Stockout Forecast',
}

/* ── Simple inline markdown renderer ───────────────────────────── */
function renderInline(text: string): React.ReactNode {
  // Handle **bold** and `code` inline patterns
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
          return <strong key={i} style={{ fontWeight: 700, color: '#000' }}>{part.slice(2, -2)}</strong>
        }
        if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
          return (
            <code key={i} style={{
              fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem',
              background: 'var(--bg-hover)', padding: '1px 5px', borderRadius: '3px',
            }}>
              {part.slice(1, -1)}
            </code>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

function MarkdownContent({ text }: { text: string }) {
  const lines = text.split('\n')
  const nodes: React.ReactNode[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.trim() === '') {
      nodes.push(<div key={`gap-${i}`} style={{ height: '0.375rem' }} />)
      continue
    }

    if (line.startsWith('## ')) {
      nodes.push(
        <div key={i} style={{ fontSize: '0.875rem', fontWeight: 700, color: '#000', marginTop: '0.625rem', marginBottom: '0.25rem' }}>
          {renderInline(line.slice(3))}
        </div>
      )
    } else if (line.startsWith('### ')) {
      nodes.push(
        <div key={i} style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#000', marginTop: '0.5rem', marginBottom: '0.125rem' }}>
          {renderInline(line.slice(4))}
        </div>
      )
    } else if (/^[-•*] /.test(line)) {
      nodes.push(
        <div key={i} style={{ display: 'flex', gap: '0.5rem', fontSize: '0.8125rem', color: 'var(--ink-2)', lineHeight: 1.65 }}>
          <span style={{ color: 'var(--ink-4)', flexShrink: 0, marginTop: '1px' }}>•</span>
          <span>{renderInline(line.replace(/^[-•*] /, ''))}</span>
        </div>
      )
    } else if (/^\d+\. /.test(line)) {
      const m = line.match(/^(\d+)\. (.*)/)
      if (m) {
        nodes.push(
          <div key={i} style={{ display: 'flex', gap: '0.5rem', fontSize: '0.8125rem', color: 'var(--ink-2)', lineHeight: 1.65 }}>
            <span style={{ color: 'var(--ink-4)', flexShrink: 0, minWidth: '1.25rem', fontVariantNumeric: 'tabular-nums' }}>{m[1]}.</span>
            <span>{renderInline(m[2])}</span>
          </div>
        )
      }
    } else {
      nodes.push(
        <p key={i} style={{ fontSize: '0.8125rem', color: 'var(--ink-2)', lineHeight: 1.65, margin: 0 }}>
          {renderInline(line)}
        </p>
      )
    }
  }

  return <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>{nodes}</div>
}

/* ── Typing indicator ───────────────────────────────────────────── */
function TypingDots() {
  return (
    <div style={{ display: 'flex', gap: '4px', alignItems: 'center', padding: '2px 0' }}>
      {[0, 1, 2].map(i => (
        <div
          key={i}
          style={{
            width: 6, height: 6, borderRadius: '50%', background: 'var(--ink-4)',
            animation: 'typingBounce 1.2s ease-in-out infinite',
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
      <style>{`
        @keyframes typingBounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

/* ── Skeleton ───────────────────────────────────────────────────── */
function Skeleton({ h = 48 }: { h?: number }) {
  return <div className="skeleton" style={{ height: h, borderRadius: 6, width: '100%' }} />
}

/* ── Main Page ──────────────────────────────────────────────────── */
export default function AdvisorPage() {
  const [searchParams] = useSearchParams()
  const supplierParam = searchParams.get('supplier')
  const nameParam     = searchParams.get('name')

  const [messages, setMessages]   = useState<Message[]>([])
  const [input, setInput]         = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const sessionIdRef       = useRef<string | null>(null)
  const messagesEndRef     = useRef<HTMLDivElement>(null)
  const hasAutoFilledRef   = useRef(false)
  const inputRef           = useRef<HTMLTextAreaElement>(null)

  const { data: risks }      = useRiskAnalysis()
  const { data: disruptions } = useDisruptions()
  const { data: financial }   = useFinancialSummary()
  const { data: actionData }  = useActionCards()

  const riskList: SupplierRiskAnalysis[] = (risks as SupplierRiskAnalysis[] | undefined) ?? []

  // Top 5 suppliers sorted by risk score descending — fully from live data
  const topRisks = useMemo(
    () => [...riskList].sort((a, b) => b.overall_score - a.overall_score).slice(0, 5),
    [riskList]
  )

  // Starter questions built from actual live risk data — no hardcoded supplier names
  const starterQuestions = useMemo(() => {
    if (!riskList.length) return []
    const criticals = riskList.filter(r => r.risk_level === 'critical')
    const highs     = riskList.filter(r => r.risk_level === 'high')
    const qs: string[] = []

    if (criticals[0]) {
      qs.push(`What if ${criticals[0].supplier_name} shuts down for 10 days? Analyse the full cascade and financial impact.`)
    }
    if (criticals[1]) {
      qs.push(`How exposed are we if ${criticals[1].supplier_name} faces a prolonged disruption this quarter?`)
    }
    if (highs[0]) {
      qs.push(`What happens to our stockout risk if ${highs[0].supplier_name} delays all shipments by 2 weeks?`)
    }
    // Always include a portfolio-level question
    qs.push(`Which suppliers pose the highest cascade risk right now, and what's our total downside exposure?`)

    return qs.slice(0, 4)
  }, [riskList])

  // Scroll to bottom whenever messages or loading state changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isLoading) return

    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    }])
    setInput('')
    setIsLoading(true)

    try {
      const res = await api.sendChatMessage(trimmed, sessionIdRef.current)
      // Persist session so follow-up questions have conversation context
      sessionIdRef.current = res.session_id
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: res.answer,
        sources: res.sources?.filter(Boolean) ?? [],
        timestamp: new Date(),
      }])
    } catch {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Unable to reach the analysis engine. Please check your connection and try again.',
        isError: true,
        timestamp: new Date(),
      }])
    } finally {
      setIsLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isLoading])

  // If deep-linked from Risk Detail page (?supplier=id&name=Name), auto-fire an opening question
  useEffect(() => {
    if (supplierParam && nameParam && riskList.length > 0 && !hasAutoFilledRef.current) {
      hasAutoFilledRef.current = true
      sendMessage(
        `Analyse the current risk situation for ${nameParam}. What are the key vulnerabilities, and what is the worst-case scenario if they experience a major disruption?`
      )
    }
  // sendMessage changes identity only when isLoading changes, which is fine here
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierParam, nameParam, riskList.length])

  const handleNewConversation = () => {
    setMessages([])
    sessionIdRef.current  = null
    hasAutoFilledRef.current = false
    setInput('')
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  // Auto-resize textarea as user types
  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const t = e.currentTarget
    t.style.height = 'auto'
    t.style.height = `${Math.min(t.scrollHeight, 120)}px`
  }

  const hasMessages = messages.length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 100px)' }}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)', marginBottom: '0.75rem',
        flexShrink: 0,
      }}>
        <div>
          <h1 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#000', letterSpacing: '-0.02em', margin: 0 }}>
            AI Supply Chain Advisor
          </h1>
          <p style={{ fontSize: '0.75rem', color: 'var(--ink-3)', margin: '0.25rem 0 0', lineHeight: 1.4 }}>
            Ask what-if questions about your live supply chain. Powered by real-time risk intelligence.
          </p>
        </div>
        {hasMessages && (
          <button
            onClick={handleNewConversation}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.375rem',
              padding: '0.5rem 0.875rem',
              background: 'none', border: '1px solid var(--border)', borderRadius: '0.5rem',
              fontSize: '0.75rem', fontWeight: 600, color: 'var(--ink-2)', cursor: 'pointer',
              fontFamily: 'inherit', transition: 'all 150ms ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#000'; e.currentTarget.style.color = '#000' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--ink-2)' }}
          >
            <RotateCcw size={13} />
            New Conversation
          </button>
        )}
      </div>

      {/* ── Split Panel ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '0.75rem', flex: 1, overflow: 'hidden', minHeight: 0 }}>

        {/* ── Left: Context Panel ─────────────────────────────── */}
        <div style={{
          width: '280px', minWidth: '280px', flexShrink: 0,
          display: 'flex', flexDirection: 'column', gap: '0.5rem',
          overflowY: 'auto',
        }}>

          {/* Live Snapshot — all values from API */}
          <div style={{
            background: '#000', borderRadius: '0.5rem', padding: '0.875rem',
            flexShrink: 0,
          }}>
            <div style={{ fontSize: '0.5rem', fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.625rem' }}>
              Live Snapshot
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {[
                {
                  label: 'Total Exposure',
                  value: financial ? formatINR(financial.total_financial_exposure_inr) : '—',
                  color: '#fff',
                },
                {
                  label: 'Active Disruptions',
                  value: disruptions?.total_active !== undefined ? String(disruptions.total_active) : '—',
                  color: (disruptions?.total_active ?? 0) > 0 ? '#c55b55' : '#4ade80',
                },
                {
                  label: 'Pending Actions',
                  value: actionData?.unresolved !== undefined ? String(actionData.unresolved) : '—',
                  color: '#fff',
                },
                {
                  label: 'Critical Suppliers',
                  value: riskList.length > 0 ? String(riskList.filter(r => r.risk_level === 'critical').length) : '—',
                  color: riskList.filter(r => r.risk_level === 'critical').length > 0 ? '#c55b55' : '#4ade80',
                },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.5)' }}>{label}</span>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 700, color, fontFamily: 'JetBrains Mono, monospace' }}>
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Top Risks — click to pre-fill a question */}
          <div style={{
            background: '#fff', border: '1px solid var(--border)', borderRadius: '0.5rem',
            padding: '0.75rem', flexShrink: 0,
          }}>
            <div style={{ fontSize: '0.5rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
              Top Risks — Click to Ask
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              {topRisks.length === 0
                ? [1, 2, 3, 4, 5].map(i => <Skeleton key={i} h={44} />)
                : topRisks.map(r => (
                  <button
                    key={r.supplier_id}
                    onClick={() => {
                      // Pre-fill input with a question about this specific supplier (name from live data)
                      setInput(`What's the current risk status for ${r.supplier_name}? What are the most critical issues and what would happen if they faced a major disruption?`)
                      inputRef.current?.focus()
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem',
                      padding: '0.5rem 0.625rem',
                      background: 'var(--bg-app)', border: '1px solid var(--border)',
                      borderRadius: '0.375rem', cursor: 'pointer', width: '100%', textAlign: 'left',
                      fontFamily: 'inherit', transition: 'all 150ms ease',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = RISK_COLORS[r.risk_level] ?? '#000'
                      e.currentTarget.style.background = '#fff'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = 'var(--border)'
                      e.currentTarget.style.background = 'var(--bg-app)'
                    }}
                  >
                    <div style={{
                      width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0,
                      background: RISK_COLORS[r.risk_level] ?? '#000',
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#000', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.supplier_name}
                      </div>
                      <div style={{ fontSize: '0.5625rem', color: 'var(--ink-4)', marginTop: '1px' }}>
                        {(r.overall_score * 100).toFixed(0)}% risk · {r.risk_level.toUpperCase()}
                      </div>
                    </div>
                    <ChevronRight size={12} color="var(--ink-4)" style={{ flexShrink: 0 }} />
                  </button>
                ))
              }
            </div>
          </div>

          {/* How It Works */}
          <div style={{
            border: '1px dashed var(--border)', borderRadius: '0.5rem',
            padding: '0.75rem', flexShrink: 0,
          }}>
            <div style={{ fontSize: '0.5rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
              How It Works
            </div>
            {([
              ['Ask anything', 'Type a what-if question or click a risk above'],
              ['Live analysis', 'AI queries live supplier, financial & cascade data from your database'],
              ['Actionable answers', 'Get impact estimates, affected suppliers & recommended next steps'],
            ] as [string, string][]).map(([title, desc]) => (
              <div key={title} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#000', flexShrink: 0, marginTop: '5px' }} />
                <div>
                  <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: '#000' }}>{title}</div>
                  <div style={{ fontSize: '0.625rem', color: 'var(--ink-3)', lineHeight: 1.5 }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right: Chat Panel ────────────────────────────────── */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          background: '#fff', border: '1px solid var(--border)', borderRadius: '0.5rem',
          overflow: 'hidden', minWidth: 0,
        }}>

          {/* Messages area */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: '1.25rem',
            display: 'flex', flexDirection: 'column',
          }}>

            {!hasMessages ? (
              /* ── Empty state ── */
              <div style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: '1.5rem', padding: '2rem', height: '100%',
              }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{
                    width: '48px', height: '48px', borderRadius: '12px', background: '#000',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem',
                  }}>
                    <Bot size={22} color="#fff" />
                  </div>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: '#000', marginBottom: '0.375rem' }}>
                    Ask a What-If Question
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--ink-3)', maxWidth: '380px', lineHeight: 1.55 }}>
                    Analyse your live supply chain. Ask about disruption scenarios, financial exposure, cascade risk, or stockout forecasts.
                  </div>
                </div>

                {/* Dynamic starter questions — built from live risk data */}
                {starterQuestions.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%', maxWidth: '500px' }}>
                    <div style={{ fontSize: '0.5625rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'center', marginBottom: '0.125rem' }}>
                      Suggested — based on your current risks
                    </div>
                    {starterQuestions.map((q, i) => (
                      <button
                        key={i}
                        onClick={() => sendMessage(q)}
                        style={{
                          padding: '0.625rem 0.875rem',
                          background: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: '0.5rem',
                          fontSize: '0.75rem', color: 'var(--ink-2)', cursor: 'pointer', textAlign: 'left',
                          fontFamily: 'inherit', lineHeight: 1.5, transition: 'all 150ms ease',
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.borderColor = '#000'
                          e.currentTarget.style.color = '#000'
                          e.currentTarget.style.background = '#fff'
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.borderColor = 'var(--border)'
                          e.currentTarget.style.color = 'var(--ink-2)'
                          e.currentTarget.style.background = 'var(--bg-app)'
                        }}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}

                {/* Loading skeleton for starter questions if data not ready yet */}
                {starterQuestions.length === 0 && riskList.length === 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%', maxWidth: '500px' }}>
                    {[1, 2, 3, 4].map(i => <Skeleton key={i} h={40} />)}
                  </div>
                )}
              </div>
            ) : (
              /* ── Message list ── */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {messages.map(msg => (
                  <div
                    key={msg.id}
                    style={{
                      display: 'flex',
                      flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                      gap: '0.625rem',
                      alignItems: 'flex-start',
                    }}
                  >
                    {/* AI avatar */}
                    {msg.role === 'assistant' && (
                      <div style={{
                        width: '28px', height: '28px', borderRadius: '8px', background: '#000',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0, marginTop: '2px',
                      }}>
                        <Bot size={14} color="#fff" />
                      </div>
                    )}

                    <div style={{ maxWidth: '78%', display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                      {/* Bubble */}
                      <div style={{
                        padding: '0.625rem 0.875rem',
                        background: msg.role === 'user'
                          ? '#000'
                          : msg.isError
                          ? '#FEF2F2'
                          : 'var(--bg-app)',
                        border: msg.role === 'user'
                          ? 'none'
                          : `1px solid ${msg.isError ? '#FECACA' : 'var(--border)'}`,
                        borderRadius: msg.role === 'user'
                          ? '12px 12px 4px 12px'
                          : '12px 12px 12px 4px',
                      }}>
                        {msg.role === 'user' ? (
                          <p style={{ margin: 0, fontSize: '0.8125rem', lineHeight: 1.55, color: '#fff' }}>
                            {msg.content}
                          </p>
                        ) : (
                          <MarkdownContent text={msg.content} />
                        )}
                      </div>

                      {/* Sources — shown as small chips with readable labels */}
                      {msg.sources && msg.sources.length > 0 && (
                        <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', paddingLeft: '2px' }}>
                          {msg.sources.map(s => (
                            <span
                              key={s}
                              style={{
                                fontSize: '0.5rem', padding: '2px 6px', borderRadius: '3px',
                                background: 'var(--bg-hover)', border: '1px solid var(--border)',
                                color: 'var(--ink-4)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                              }}
                            >
                              {SOURCE_LABELS[s] ?? s}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Timestamp */}
                      <div style={{
                        fontSize: '0.5rem', color: 'var(--ink-5)',
                        paddingLeft: '2px',
                        textAlign: msg.role === 'user' ? 'right' : 'left',
                      }}>
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                ))}

                {/* Typing indicator while waiting for AI response */}
                {isLoading && (
                  <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'flex-start' }}>
                    <div style={{
                      width: '28px', height: '28px', borderRadius: '8px', background: '#000',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <Bot size={14} color="#fff" />
                    </div>
                    <div style={{
                      padding: '0.625rem 0.875rem',
                      background: 'var(--bg-app)', border: '1px solid var(--border)',
                      borderRadius: '12px 12px 12px 4px',
                    }}>
                      <TypingDots />
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* ── Input area ─────────────────────────────────────── */}
          <div style={{
            padding: '0.75rem', borderTop: '1px solid var(--border)',
            display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexShrink: 0,
          }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onInput={handleInput}
              placeholder={isLoading ? 'Analysing…' : 'Ask a what-if question… e.g. "What if our top supplier shuts down for 2 weeks?"'}
              disabled={isLoading}
              rows={1}
              style={{
                flex: 1, padding: '0.625rem 0.75rem',
                border: '1px solid var(--border)', borderRadius: '0.5rem',
                fontSize: '0.8125rem', fontFamily: 'inherit', color: '#000',
                resize: 'none', outline: 'none', lineHeight: 1.55,
                background: isLoading ? 'var(--bg-app)' : '#fff',
                minHeight: '38px', maxHeight: '120px', overflowY: 'auto',
                transition: 'border-color 150ms ease',
              }}
              onFocus={e => { e.target.style.borderColor = '#000' }}
              onBlur={e => { e.target.style.borderColor = 'var(--border)' }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={isLoading || !input.trim()}
              style={{
                width: '38px', height: '38px', borderRadius: '0.5rem',
                background: isLoading || !input.trim() ? 'var(--bg-hover)' : '#000',
                border: 'none',
                cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, transition: 'all 150ms ease',
              }}
            >
              <Send size={15} color={isLoading || !input.trim() ? 'var(--ink-4)' : '#fff'} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
