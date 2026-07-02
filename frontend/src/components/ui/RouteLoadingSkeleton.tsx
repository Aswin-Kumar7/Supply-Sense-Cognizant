/**
 * Loading skeleton displayed while a lazy-loaded route is being fetched.
 */
export function RouteLoadingSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.5rem' }}>
      {/* Header skeleton */}
      <div className="skeleton" style={{ height: '1.75rem', width: '12rem', borderRadius: '0.375rem' }} />

      {/* Three-column card skeletons */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
        {[1, 2, 3].map(i => (
          <div key={i} className="skeleton" style={{ height: '8rem', borderRadius: '0.75rem' }} />
        ))}
      </div>

      {/* Two-column row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        {[4, 5].map(i => (
          <div key={i} className="skeleton" style={{ height: '5rem', borderRadius: '0.75rem' }} />
        ))}
      </div>
    </div>
  )
}
