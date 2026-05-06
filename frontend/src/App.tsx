import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import { router } from './router'

/**
 * Concurrency limiter for API requests.
 * Limits simultaneous in-flight queries to 4 to reduce backend pressure.
 * Validates: Requirements 5.1
 */
let activeRequests = 0
const MAX_CONCURRENT = 4
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
