import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import { router } from './router'

/**
 * Concurrency limiter for API requests.
 * Caps simultaneous in-flight queries to protect the backend, but high enough
 * that the fast deterministic dashboard queries don't queue behind the slow AI
 * endpoints (procurement cards / executive brief). The Neon pool (size 20)
 * comfortably handles this. Was 4 — too low, starved first paint.
 */
let activeRequests = 0
const MAX_CONCURRENT = 10
const queue: Array<() => void> = []

function waitForSlot(): Promise<void> {
  if (activeRequests < MAX_CONCURRENT) {
    activeRequests++
    return Promise.resolve()
  }
  return new Promise<void>((resolve) => {
    queue.push(() => {
      activeRequests++
      resolve()
    })
  })
}

function releaseSlot(): void {
  activeRequests--
  const next = queue.shift()
  if (next) next()
}

export async function concurrencyLimitedFetch<T>(fn: () => Promise<T>): Promise<T> {
  await waitForSlot()
  try {
    return await fn()
  } finally {
    releaseSlot()
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,       // 30 seconds
      retry: 3,
      gcTime: 600_000,         // 10 minutes
      refetchOnWindowFocus: false,
    },
  },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

export default App
