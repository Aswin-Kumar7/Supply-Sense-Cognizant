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
          width: '48px',
          height: '48px',
          borderRadius: '8px',
          background: '#0F172A',
          color: '#FFF',
          border: '1px solid #1E293B',
          boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08), 0 1px 2px rgba(15, 23, 42, 0.04)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 9999,
          transition: 'all 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = '#1E293B'
          e.currentTarget.style.transform = 'translateY(-2px)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = '#0F172A'
          e.currentTarget.style.transform = 'translateY(0)'
        }}
      >
        {isOpen ? <X size={18} /> : <MessageSquare size={18} />}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div style={{
          position: 'fixed',
          bottom: '84px',
          right: '24px',
          width: '380px',
          height: '560px',
          maxHeight: 'calc(100vh - 120px)',
          background: '#FFFFFF',
          borderRadius: '12px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 12px 30px rgba(15, 23, 42, 0.08), 0 1px 3px rgba(0,0,0,0.02)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 9998,
          overflow: 'hidden',
          animation: 'slideUp 200ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
        }}>
          <style>{`
            @keyframes slideUp {
              from { opacity: 0; transform: translateY(12px); }
              to { opacity: 1; transform: translateY(0); }
            }
          `}</style>

          {/* Header */}
          <div style={{ 
            padding: '14px 20px', 
            background: '#FFFFFF', 
            borderBottom: '1px solid #F1F5F9',
            color: '#0F172A', 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center' 
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Bot size={16} color="#4F46E5" />
              </div>
              <div>
                <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#0F172A', letterSpacing: '-0.01em' }}>Copilot Advisor</div>
                <div style={{ fontSize: '0.6875rem', color: '#64748B' }}>Supply chain path analyzer</div>
              </div>
            </div>
            {messages.length > 0 && (
              <button
                onClick={() => { setMessages([]); sessionIdRef.current = null }}
                style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center', transition: 'color 150ms ease' }}
                onMouseEnter={e => e.currentTarget.style.color = '#0F172A'}
                onMouseLeave={e => e.currentTarget.style.color = '#94A3B8'}
                title="Reset conversation"
              >
                <RotateCcw size={14} />
              </button>
            )}
          </div>

          {/* Messages Area */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: '16px', background: '#F8FAFC' }}>
            {messages.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: '12px' }}>
                <Bot size={36} color="#94A3B8" style={{ marginBottom: '16px', opacity: 0.8 }} />
                <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0F172A', margin: '0 0 8px 0', letterSpacing: '-0.02em' }}>Simulate What-If Scenarios</h3>
                <p style={{ fontSize: '0.75rem', color: '#64748B', margin: '0 0 24px 0', maxWidth: '280px', lineHeight: 1.5 }}>
                  Ask about route disruption cascades, active stockout projections, or custom supplier exposure calculations.
                </p>

                {starterQuestions.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                    <div style={{ fontSize: '0.625rem', fontWeight: 700, textTransform: 'uppercase', color: '#94A3B8', letterSpacing: '0.06em', textAlign: 'left', marginBottom: '4px' }}>Suggested Actions</div>
                    {starterQuestions.map((q, i) => (
                      <button
                        key={i}
                        onClick={() => sendMessage(q)}
                        style={{
                          padding: '10px 14px', 
                          background: '#FFFFFF', 
                          border: '1px solid #E2E8F0', 
                          borderRadius: '8px',
                          fontSize: '0.75rem', 
                          color: '#334155', 
                          fontWeight: 500,
                          cursor: 'pointer', 
                          textAlign: 'left', 
                          lineHeight: 1.4,
                          boxShadow: '0 1px 2px rgba(15,23,42,0.02)', 
                          transition: 'all 150ms ease'
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.borderColor = '#4F46E5'
                          e.currentTarget.style.color = '#4F46E5'
                          e.currentTarget.style.background = '#EEF2FF'
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.borderColor = '#E2E8F0'
                          e.currentTarget.style.color = '#334155'
                          e.currentTarget.style.background = '#FFFFFF'
                        }}
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
                  <div key={msg.id} style={{ display: 'flex', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row', gap: '10px', alignItems: 'flex-start' }}>
                    <div style={{ maxWidth: '85%', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                      <div style={{
                        padding: '10px 14px',
                        background: msg.role === 'user' ? '#4F46E5' : msg.isError ? '#FEF2F2' : '#FFFFFF',
                        color: msg.role === 'user' ? '#FFFFFF' : '#0F172A',
                        border: msg.role === 'user' ? 'none' : msg.isError ? '1px solid #FECACA' : '1px solid #E2E8F0',
                        borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                        boxShadow: msg.role === 'user' ? '0 2px 6px rgba(79,70,229,0.15)' : '0 2px 8px rgba(15,23,42,0.03)',
                      }}>
                        {msg.role === 'user' ? (
                          <div style={{ fontSize: '0.75rem', lineHeight: 1.45, fontWeight: 500, color: '#FFFFFF' }}>{msg.content}</div>
                        ) : (
                          <MarkdownContent text={msg.content} />
                        )}
                      </div>
                      
                      {msg.sources && msg.sources.length > 0 && (
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                          {msg.sources.map(s => (
                            <span key={s} style={{ fontSize: '0.5625rem', padding: '2px 6px', borderRadius: '4px', background: '#E2E8F0', color: '#475569', fontWeight: 650, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                              {SOURCE_LABELS[s] ?? s}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {isLoading && (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <div style={{ padding: '10px 14px', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px 12px 12px 2px', boxShadow: '0 2px 8px rgba(15,23,42,0.03)' }}>
                      <TypingDots />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Input Area */}
          <div style={{ padding: '14px 16px', background: '#FFFFFF', borderTop: '1px solid #F1F5F9', display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onInput={handleInput}
              placeholder={isLoading ? 'Calculating...' : 'Ask a scenario question...'}
              disabled={isLoading}
              rows={1}
              style={{
                flex: 1, 
                padding: '10px 14px', 
                border: '1px solid #E2E8F0', 
                borderRadius: '20px', 
                fontSize: '0.75rem',
                color: '#0F172A',
                fontFamily: 'inherit', 
                resize: 'none', 
                outline: 'none', 
                lineHeight: 1.4, 
                background: isLoading ? '#F8FAFC' : '#FFFFFF',
                minHeight: '38px', 
                maxHeight: '80px', 
                transition: 'all 150ms ease',
                boxShadow: 'inset 0 1px 2px rgba(15,23,42,0.02)'
              }}
              onFocus={e => {
                e.target.style.borderColor = '#4F46E5'
                e.target.style.boxShadow = 'inset 0 1px 2px rgba(15,23,42,0.02), 0 0 0 2px rgba(79, 70, 229, 0.1)'
              }}
              onBlur={e => {
                e.target.style.borderColor = '#E2E8F0'
                e.target.style.boxShadow = 'inset 0 1px 2px rgba(15,23,42,0.02)'
              }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={isLoading || !input.trim()}
              style={{
                width: '38px', 
                height: '38px', 
                borderRadius: '50%', 
                background: isLoading || !input.trim() ? '#F1F5F9' : '#0F172A',
                color: isLoading || !input.trim() ? '#94A3B8' : '#FFFFFF',
                border: 'none', 
                cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                flexShrink: 0, 
                transition: 'all 150ms ease',
                boxShadow: isLoading || !input.trim() ? 'none' : '0 2px 6px rgba(15,23,42,0.1)'
              }}
              onMouseEnter={e => {
                if (!isLoading && input.trim()) {
                  e.currentTarget.style.background = '#1E293B'
                }
              }}
              onMouseLeave={e => {
                if (!isLoading && input.trim()) {
                  e.currentTarget.style.background = '#0F172A'
                }
              }}
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
