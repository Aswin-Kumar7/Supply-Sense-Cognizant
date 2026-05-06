/**
 * Loading skeleton displayed while a lazy-loaded route is being fetched.
 * Matches the dark theme with subtle pulse animation.
 */
export function RouteLoadingSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-6 animate-pulse">
      {/* Header skeleton */}
      <div className="h-6 w-48 rounded bg-slate-700/50" />

      {/* Panel skeletons */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-48 rounded-lg bg-slate-800/60 border border-slate-700/30"
          />
        ))}
      </div>

      {/* Additional row skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[4, 5].map((i) => (
          <div
            key={i}
            className="h-36 rounded-lg bg-slate-800/60 border border-slate-700/30"
          />
        ))}
      </div>
    </div>
  )
}
