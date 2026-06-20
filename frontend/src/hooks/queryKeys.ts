export const queryKeys = {
  dashboard: ['dashboard'] as const,
  suppliers: ['suppliers'] as const,
  disruptions: ['disruptions'] as const,
  risk: (supplierId: string) => ['risk', supplierId] as const,
  financial: ['financial'] as const,
  stockout: ['stockout'] as const,
  procurement: ['procurement'] as const,
  skus: ['skus'] as const,
  executiveBrief: ['executiveBrief'] as const,
  actionCards: ['actionCards'] as const,
  health: ['health'] as const,
  supplierDependencies: ['supplierDependencies'] as const,
}

export const staleTimes = {
  realtime: 30_000,   // 30s for live data (disruptions, events)
  computed: 300_000,  // 5min for risk computations
  static: 600_000,    // 10min for reference data (suppliers list)
}
