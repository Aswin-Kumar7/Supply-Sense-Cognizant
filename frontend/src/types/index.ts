export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

// ============ Supplier Domain ============

export interface RiskFactorBreakdown {
  value: number
  weighted: number
  explanation: string
}

export interface Supplier {
  id: string
  name: string
  city: string
  state: string
  region: string
  category: string
  tier: number
  reliability_score: number
  lead_time_days: number
  risk_zone: string | null
  latitude: number | null
  longitude: number | null
  created_at: string
  risk_breakdown: Record<string, RiskFactorBreakdown> | null
}

export interface SupplierListResponse {
  suppliers: Supplier[]
  total: number
}

// ============ SKU Domain ============

export interface SKURisk {
  id: string
  sku_code: string
  name: string
  category: string
  supplier_name: string
  current_stock: number
  daily_demand_avg: number
  days_of_stock: number
  stockout_risk: RiskLevel
  unit_cost_inr: number
  is_critical: boolean
}

export interface SKUListResponse {
  skus: SKURisk[]
  total: number
}

// ============ Disruption Domain ============

export interface Disruption {
  id: string
  supplier_id: string
  disruption_type: string
  severity: RiskLevel
  title: string
  description: string | null
  start_date: string
  end_date: string | null
  impact_score: number
  affected_skus_count: number
  region: string | null
  is_active: boolean
  created_at: string
}

export interface DisruptionTimelineResponse {
  disruptions: Disruption[]
  total_active: number
  total_resolved: number
}

// ============ Action Cards ============

export interface ActionCard {
  id: string
  title: string
  description: string | null
  action_type: string
  priority: RiskLevel
  supplier_id: string | null
  sku_id: string | null
  estimated_impact_inr: number
  is_resolved: boolean
  resolution_note: string | null
  created_at: string
  resolved_at: string | null
}

export interface ActionCardListResponse {
  action_cards: ActionCard[]
  total: number
  unresolved: number
}

// ============ Dashboard Summary ============

export interface SupplierHealthSummary {
  total_suppliers: number
  high_risk_count: number
  medium_risk_count: number
  low_risk_count: number
  avg_reliability: number
}

export interface InventorySummary {
  total_skus: number
  critical_stockout_risk: number
  low_stock_count: number
  total_inventory_value_inr: number
}

export interface DisruptionSummary {
  active_disruptions: number
  critical_disruptions: number
  affected_suppliers: number
  avg_impact_score: number
}

export interface ActionSummary {
  pending_actions: number
  critical_actions: number
  estimated_savings_inr: number
}

export interface DashboardSummary {
  supplier_health: SupplierHealthSummary
  inventory: InventorySummary
  disruptions: DisruptionSummary
  actions: ActionSummary
}

// ============ Real-Time Events ============

export type EventType =
  | 'delivery_update'
  | 'inventory_update'
  | 'disruption_alert'
  | 'supplier_risk'
  | 'demand_spike'
  | 'action_generated'
  | 'scenario_triggered'
  | 'scenario_deactivated'
  | 'risk_update'
  | 'stockout_warning'
  | 'strands_fallback_request'

export interface SSEEvent {
  id: string
  timestamp: string
  event_type: EventType | string
  severity: RiskLevel
  message: string
  data: Record<string, unknown>
}

// ============ Risk Intelligence ============

export interface RiskFactor {
  value: number
  weighted: number
  explanation: string
}

export interface SupplierRiskAnalysis {
  supplier_id: string
  supplier_name: string
  overall_score: number
  risk_level: RiskLevel
  confidence: number
  human_review_required?: boolean
  factors: Record<string, RiskFactor>
  computed_at: string
}

export interface CascadeNode {
  supplier_id: string
  supplier_name: string
  depth: number
  propagated_impact: number
  criticality: number
  dependency_type: string
  path: string[]
}

export interface CascadeAnalysis {
  source_supplier_id: string
  source_supplier_name: string
  source_impact: number
  total_affected: number
  max_depth: number
  total_propagated_impact: number
  severity: RiskLevel
  nodes: CascadeNode[]
}

export interface StockoutForecast {
  sku_id: string
  sku_code: string
  sku_name: string
  supplier_name: string
  category: string
  current_stock: number
  daily_demand: number
  adjusted_demand: number
  days_to_stockout: number
  projected_stockout_date: string
  risk_level: RiskLevel
  revenue_at_risk_inr: number
  is_critical: boolean
  demand_factors: Record<string, number>
}

export interface StockoutSummary {
  total_skus: number
  critical_count: number
  high_count: number
  total_revenue_at_risk_inr: number
  avg_days_to_stockout: number
  forecasts: StockoutForecast[]
}

export interface FinancialExposure {
  supplier_id: string
  supplier_name: string
  total_exposure_inr: number
  exposure_level: RiskLevel
  breakdown: {
    revenue_at_risk: number
    sla_penalties: number
    stockout_cost: number
    cascade_amplifier: number
  }
}

export interface FinancialSummary {
  total_financial_exposure_inr: number
  total_revenue_at_risk_inr: number
  total_sla_penalties_inr: number
  total_stockout_cost_inr: number
  potential_mitigation_savings_inr: number
  exposure_by_category: Record<string, number>
  exposure_by_region: Record<string, number>
  top_exposures: FinancialExposure[]
}

export interface MitigationOption {
  action_type: string
  description: string
  cost_inr: number
  risk_reduction: number
  exposure_reduction_inr: number
  time_to_effect_days: number
  confidence: number
}

export interface MitigationSimulation {
  supplier_id: string
  supplier_name: string
  current_exposure_inr: number
  mitigated_exposure_inr: number  // exposure remaining after best action
  savings_inr: number             // gross reduction = current - mitigated
  mitigation_cost_inr: number     // cost to execute best action
  net_saving_inr: number          // savings - cost (true financial gain)
  risk_before: number
  risk_after: number
  options: MitigationOption[]
}

// ============ Procurement Intelligence ============

export interface IntelligentActionCard {
  supplier_id: string
  supplier_name: string
  city: string
  region: string
  category: string
  risk_score: number
  risk_level: RiskLevel
  confidence: number
  financial_exposure_inr: number
  days_to_stockout: number
  affected_skus: number
  action_type: string
  priority: RiskLevel
  title: string
  executive_summary: string
  reasoning: string
  urgency_narrative: string
  cost_of_delay_narrative: string
  recommended_action: string
  escalation_window: string
  alternate_supplier_rationale: string
}

export interface ExecutiveBrief {
  at_risk_suppliers: number
  total_exposure_inr: number
  critical_stockouts: number
  high_stockouts: number
  cascade_count: number
  avg_days_to_stockout: number
  summary: string
  top_risks: string[]
  immediate_actions: string[]
  generated_at: string
}

// ============ Chat ============

export interface ChatResponse {
  answer: string
  session_id: string
  sources: string[]
}

// ============ Mitigation Simulation ============

export interface SimulateMitigationResponse {
  supplier_id: string
  original_tfe_inr: number
  mitigated_tfe_inr: number
  reduction_pct: number
  savings_inr: number
  actions_taken: Array<{
    action_type: string
    description: string
    cost_inr: number
    risk_reduction: number
    exposure_reduction_inr: number
    time_to_effect_days: number
    confidence: number
  }>
}

// ============ Health ============

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy'
  service: string
  database: 'ok' | 'error'
  bedrock: 'ok' | 'unavailable'
  strands_agents: 'ok' | 'unavailable'
  synthetic_engine: 'ok' | 'stopped'
  session_count: number
  uptime_seconds?: number
}

// ============ Alternate Suppliers ============

export interface AlternateSupplierRecord {
  alternate_id: string
  supplier_id: string
  supplier_name: string
  city: string
  state: string
  region: string
  category: string
  reliability_score: number
  lead_time_days: number
  cost_premium_pct: number
  quality_score: number
  covers_sku: string
  sku_code: string
}

export interface AlternateSuppliersResponse {
  supplier_id: string
  count: number
  alternates: AlternateSupplierRecord[]
}
