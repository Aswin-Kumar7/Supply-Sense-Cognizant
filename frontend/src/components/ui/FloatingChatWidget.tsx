import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Send, RotateCcw, Bot, X, MessageSquare } from 'lucide-react'
import { useRiskAnalysis } from '../../hooks/useQueries'
import { api } from '../../services/api'
import type { SupplierRiskAnalysis } from '../../types'

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

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
          return <strong key={i} style={{ fontWeight: 700, color: '#111827' }}>{part.slice(2, -2)}</strong>
        }
        if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
          return (
            <code key={i} style={{
              fontFamily: 'monospace', fontSize: '0.75rem',
              background: '#F3F4F6', padding: '2px 4px', borderRadius: '4px',
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
      nodes.push(<div key={`gap-${i}`} style={{ height: '6px' }} />)
      continue
    }

    if (line.startsWith('## ')) {
      nodes.push(
        <div key={i} style={{ fontSize: '0.875rem', fontWeight: 700, color: '#111827', marginTop: '10px', marginBottom: '4px' }}>
          {renderInline(line.slice(3))}
        </div>
      )
    } else if (line.startsWith('### ')) {
      nodes.push(
        <div key={i} style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#111827', marginTop: '8px', marginBottom: '2px' }}>
          {renderInline(line.slice(4))}
        </div>
      )
    } else if (/^[-•*] /.test(line)) {
      nodes.push(
        <div key={i} style={{ display: 'flex', gap: '8px', fontSize: '0.8125rem', color: '#4B5563', lineHeight: 1.5 }}>
          <span style={{ color: '#9CA3AF', flexShrink: 0 }}>•</span>
          <span>{renderInline(line.replace(/^[-•*] /, ''))}</span>
        </div>
      )
    } else if (/^\d+\. /.test(line)) {
      const m = line.match(/^(\d+)\. (.*)/)
      if (m) {
        nodes.push(
          <div key={i} style={{ display: 'flex', gap: '8px', fontSize: '0.8125rem', color: '#4B5563', lineHeight: 1.5 }}>
            <span style={{ color: '#9CA3AF', flexShrink: 0, minWidth: '16px' }}>{m[1]}.</span>
            <span>{renderInline(m[2])}</span>
          </div>
        )
      }
    } else {
      nodes.push(
        <p key={i} style={{ fontSize: '0.8125rem', color: '#374151', lineHeight: 1.5, margin: 0 }}>
          {renderInline(line)}
        </p>
      )
    }
  }

  return <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>{nodes}</div>
}

function TypingDots() {
  return (
    <div style={{ display: 'flex', gap: '4px', alignItems: 'center', padding: '4px 0' }}>
      {[0, 1, 2].map(i => (
        <div
          key={i}
          style={{
            width: 6, height: 6, borderRadius: '50%', background: '#9CA3AF',
            animation: 'typingBounce 1.2s ease-in-out infinite',
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
      <style>{`
        @keyframes typingBounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

/* ── Widget Component ───────────────────────────────────────────── */
export function FloatingChatWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const sessionIdRef = useRef<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const { data: risks } = useRiskAnalysis()
  const riskList: SupplierRiskAnalysis[] = (risks as SupplierRiskAnalysis[] | undefined) ?? []

  const starterQuestions = useMemo(() => {
    if (!riskList.length) return []
    const criticals = riskList.filter(r => r.risk_level === 'critical')
    const highs = riskList.filter(r => r.risk_level === 'high')
    const qs: string[] = []

    if (criticals[0]) qs.push(`What if ${criticals[0].supplier_name} shuts down for 10 days? Analyse cascade risk.`)
    if (criticals[1]) qs.push(`How exposed are we if ${criticals[1].supplier_name} faces a disruption?`)
    if (highs[0]) qs.push(`What happens if ${highs[0].supplier_name} delays shipments by 2 weeks?`)
    qs.push(`Which suppliers pose the highest cascade risk right now?`)

    return qs.slice(0, 3)
  }, [riskList])

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      inputRef.current?.focus()
    }
  }, [messages, isLoading, isOpen])

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isLoading) return

    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', content: trimmed, timestamp: new Date() }])
    setInput('')
    setIsLoading(true)

    try {
      const res = await api.sendChatMessage(trimmed, sessionIdRef.current)
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
        content: 'Unable to reach the analysis engine.',
        isError: true,
        timestamp: new Date(),
      }])
    } finally {
      setIsLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isLoading])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const t = e.currentTarget
    t.style.height = 'auto'
    t.style.height = `${Math.min(t.scrollHeight, 100)}px`
  }

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          width: '56px',
          height: '56px',
          borderRadius: '28px',
          background: '#111827',
          color: '#FFF',
          border: 'none',
          boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 9999,
          transition: 'transform 0.2s ease, background 0.2s ease',
          transform: isOpen ? 'scale(0.9)' : 'scale(1)',
        }}
        onMouseEnter={e => e.currentTarget.style.background = '#374151'}
        onMouseLeave={e => e.currentTarget.style.background = '#111827'}
      >
        {isOpen ? <X size={24} /> : <MessageSquare size={24} />}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div style={{
          position: 'fixed',
          bottom: '96px',
          right: '24px',
          width: '400px',
          height: '600px',
          maxHeight: 'calc(100vh - 120px)',
          background: '#FFF',
          borderRadius: '16px',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.05)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 9998,
          overflow: 'hidden',
          animation: 'slideUp 0.2s ease-out forwards',
        }}>
          <style>{`
            @keyframes slideUp {
              from { opacity: 0; transform: translateY(20px); }
              to { opacity: 1; transform: translateY(0); }
            }
          `}</style>

          {/* Header */}
          <div style={{ padding: '16px 20px', background: '#111827', color: '#FFF', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Bot size={18} color="#FFF" />
              </div>
              <div>
                <div style={{ fontSize: '0.9375rem', fontWeight: 700 }}>AI Advisor</div>
                <div style={{ fontSize: '0.6875rem', color: '#9CA3AF' }}>Supply Chain Intelligence</div>
              </div>
            </div>
            {messages.length > 0 && (
              <button
                onClick={() => { setMessages([]); sessionIdRef.current = null }}
                style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', padding: '4px' }}
                title="New Conversation"
              >
                <RotateCcw size={16} />
              </button>
            )}
          </div>

          {/* Messages Area */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', background: '#F9FAFB' }}>
            {messages.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                <Bot size={40} color="#D1D5DB" style={{ marginBottom: '16px' }} />
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', margin: '0 0 8px 0' }}>Ask a What-If Question</h3>
                <p style={{ fontSize: '0.8125rem', color: '#6B7280', margin: '0 0 24px 0', maxWidth: '280px', lineHeight: 1.5 }}>
                  Analyse your live supply chain. Ask about disruption scenarios, financial exposure, or stockout forecasts.
                </p>

                {starterQuestions.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                    <div style={{ fontSize: '0.625rem', fontWeight: 700, textTransform: 'uppercase', color: '#9CA3AF', letterSpacing: '0.05em' }}>Suggested Questions</div>
                    {starterQuestions.map((q, i) => (
                      <button
                        key={i}
                        onClick={() => sendMessage(q)}
                        style={{
                          padding: '10px 12px', background: '#FFF', border: '1px solid #E5E7EB', borderRadius: '8px',
                          fontSize: '0.75rem', color: '#374151', cursor: 'pointer', textAlign: 'left', lineHeight: 1.4,
                          boxShadow: '0 1px 2px rgba(0,0,0,0.02)', transition: 'border-color 0.15s ease'
                        }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = '#111827'}
                        onMouseLeave={e => e.currentTarget.style.borderColor = '#E5E7EB'}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                {messages.map(msg => (
                  <div key={msg.id} style={{ display: 'flex', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row', gap: '10px', alignItems: 'flex-end' }}>
                    {msg.role === 'assistant' && (
                      <div style={{ width: '24px', height: '24px', borderRadius: '6px', background: '#111827', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Bot size={12} color="#FFF" />
                      </div>
                    )}
                    <div style={{ maxWidth: '85%', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                      <div style={{
                        padding: '10px 14px',
                        background: msg.role === 'user' ? '#111827' : msg.isError ? '#FEF2F2' : '#FFF',
                        color: msg.role === 'user' ? '#FFF' : '#111827',
                        border: `1px solid ${msg.role === 'user' ? '#111827' : msg.isError ? '#FECACA' : '#E5E7EB'}`,
                        borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                      }}>
                        {msg.role === 'user' ? (
                          <div style={{ fontSize: '0.8125rem', lineHeight: 1.5 }}>{msg.content}</div>
                        ) : (
                          <MarkdownContent text={msg.content} />
                        )}
                      </div>
                      
                      {msg.sources && msg.sources.length > 0 && (
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {msg.sources.map(s => (
                            <span key={s} style={{ fontSize: '0.5625rem', padding: '2px 6px', borderRadius: '4px', background: '#E5E7EB', color: '#4B5563', fontWeight: 600, textTransform: 'uppercase' }}>
                              {SOURCE_LABELS[s] ?? s}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {isLoading && (
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                    <div style={{ width: '24px', height: '24px', borderRadius: '6px', background: '#111827', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Bot size={12} color="#FFF" />
                    </div>
                    <div style={{ padding: '12px 16px', background: '#FFF', border: '1px solid #E5E7EB', borderRadius: '14px 14px 14px 4px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                      <TypingDots />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Input Area */}
          <div style={{ padding: '16px', background: '#FFF', borderTop: '1px solid #E5E7EB', display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onInput={handleInput}
              placeholder={isLoading ? 'Analysing...' : 'Type a what-if scenario...'}
              disabled={isLoading}
              rows={1}
              style={{
                flex: 1, padding: '10px 14px', border: '1px solid #D1D5DB', borderRadius: '8px', fontSize: '0.8125rem',
                fontFamily: 'inherit', resize: 'none', outline: 'none', lineHeight: 1.5, background: isLoading ? '#F3F4F6' : '#FFF',
                minHeight: '40px', maxHeight: '100px', transition: 'border-color 0.15s ease'
              }}
              onFocus={e => e.target.style.borderColor = '#111827'}
              onBlur={e => e.target.style.borderColor = '#D1D5DB'}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={isLoading || !input.trim()}
              style={{
                width: '40px', height: '40px', borderRadius: '8px', background: isLoading || !input.trim() ? '#E5E7EB' : '#111827',
                border: 'none', cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.15s ease'
              }}
            >
              <Send size={16} color={isLoading || !input.trim() ? '#9CA3AF' : '#FFF'} />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
