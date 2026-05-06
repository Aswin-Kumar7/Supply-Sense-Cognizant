import { useState, useEffect, useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'

const STORAGE_KEY_LAST_SYNC = 'ss_last_synced_at'
const STORAGE_KEY_BUFFER    = 'ss_cache_buffer_ms'
const STORAGE_KEY_COOLDOWN  = 'ss_refresh_cooldown_ms'

export const DEFAULT_BUFFER_MS   = 10 * 60 * 1000  // 10 minutes
export const DEFAULT_COOLDOWN_MS = 30 * 1000        // 30 seconds

function getBuffer()   { return parseInt(localStorage.getItem(STORAGE_KEY_BUFFER)   ?? String(DEFAULT_BUFFER_MS),   10) }
function getCooldown() { return parseInt(localStorage.getItem(STORAGE_KEY_COOLDOWN) ?? String(DEFAULT_COOLDOWN_MS), 10) }

function getLastSync() {
  const raw = localStorage.getItem(STORAGE_KEY_LAST_SYNC)
  return raw ? new Date(raw) : null
}

function setLastSync(d: Date) {
  localStorage.setItem(STORAGE_KEY_LAST_SYNC, d.toISOString())
}

function formatAgo(d: Date | null): string {
  if (!d) return 'never'
  const secs = Math.floor((Date.now() - d.getTime()) / 1000)
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ago`
}

interface GlobalSync {
  lastSyncedAt: Date | null
  lastSyncedLabel: string   // "4m ago"
  canRefresh: boolean
  cooldownRemaining: number // seconds remaining in cooldown
  isRefreshing: boolean
  forceRefresh: () => void
  bufferMs: number
  cooldownMs: number
  setBufferMs: (ms: number) => void
  setCooldownMs: (ms: number) => void
}

export function useGlobalSync(): GlobalSync {
  const queryClient = useQueryClient()
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(getLastSync)
  const [cooldownRemaining, setCooldownRemaining] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [bufferMs, setBufferMsState] = useState(getBuffer)
  const [cooldownMs, setCooldownMsState] = useState(getCooldown)
  const [tick, setTick] = useState(0)

  // Tick every second to update relative time label and cooldown countdown
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  // Cooldown countdown
  useEffect(() => {
    if (!lastSyncedAt) { setCooldownRemaining(0); return }
    const elapsed = Date.now() - lastSyncedAt.getTime()
    const remaining = Math.max(0, cooldownMs - elapsed)
    setCooldownRemaining(Math.ceil(remaining / 1000))
  }, [tick, lastSyncedAt, cooldownMs])

  const canRefresh = cooldownRemaining === 0 && !isRefreshing

  const forceRefresh = useCallback(async () => {
    if (!canRefresh) return
    setIsRefreshing(true)
    try {
      await queryClient.invalidateQueries()
      await queryClient.refetchQueries({ type: 'active' })
      const now = new Date()
      setLastSyncedAt(now)
      setLastSync(now)
    } finally {
      setIsRefreshing(false)
    }
  }, [canRefresh, queryClient])

  // Record first sync time on mount if never set
  const didMount = useRef(false)
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true
      if (!getLastSync()) {
        const now = new Date()
        setLastSyncedAt(now)
        setLastSync(now)
      }
    }
  }, [])

  const setBufferMs = useCallback((ms: number) => {
    localStorage.setItem(STORAGE_KEY_BUFFER, String(ms))
    setBufferMsState(ms)
  }, [])

  const setCooldownMs = useCallback((ms: number) => {
    localStorage.setItem(STORAGE_KEY_COOLDOWN, String(ms))
    setCooldownMsState(ms)
  }, [])

  return {
    lastSyncedAt,
    lastSyncedLabel: formatAgo(lastSyncedAt),
    canRefresh,
    cooldownRemaining,
    isRefreshing,
    forceRefresh,
    bufferMs,
    cooldownMs,
    setBufferMs,
    setCooldownMs,
  }
}

// Singleton context so TopBar and any other consumer share state
import { createContext, useContext } from 'react'
export const GlobalSyncContext = createContext<GlobalSync | null>(null)
export function useSync(): GlobalSync {
  const ctx = useContext(GlobalSyncContext)
  if (!ctx) throw new Error('useSync must be used within GlobalSyncProvider')
  return ctx
}
