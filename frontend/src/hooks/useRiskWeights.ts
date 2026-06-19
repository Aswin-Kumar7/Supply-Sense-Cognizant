/**
 * useRiskWeights — reads custom risk scoring weights from localStorage
 * and provides a recompute function that overrides the backend's scores.
 *
 * How it works:
 *  1. Backend returns raw factor VALUES (0–1) for each signal.
 *  2. This hook reads user-saved weights from localStorage.
 *  3. `applyWeights()` multiplies each factor.value × user_weight → new overall_score.
 *  4. Any page that calls `useWeightedRiskAnalysis()` automatically sees
 *     scores based on the custom weights — no backend changes needed.
 *
 * If no custom weights are saved, defaults match the backend exactly, so
 * scores are identical to what the API returns.
 */

import { useMemo } from 'react'
import { useRiskAnalysis } from './useQueries'
import type { SupplierRiskAnalysis } from '../types'

/* ── Weight type ──────────────────────────────────────────────────────── */
export interface RiskWeights {
  delivery_reliability: number
  disruption_severity: number
  inventory_pressure: number
  logistics_vulnerability: number
  dependency_exposure: number
  festival_proximity: number
}

/* ── Defaults — must match risk_engine.py constants exactly ───────────── */
export const DEFAULT_WEIGHTS: RiskWeights = {
  delivery_reliability:    0.25,
  disruption_severity:     0.25,
  inventory_pressure:      0.20,
  logistics_vulnerability: 0.15,
  dependency_exposure:     0.10,
  festival_proximity:      0.05,
}

const STORAGE_KEY = 'ss_risk_weights'

/* ── Load weights from localStorage ─────────────────────────────────── */
export function loadWeights(): RiskWeights {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_WEIGHTS
    const parsed = JSON.parse(raw) as Partial<RiskWeights>
    // Merge with defaults so any new keys added later still have a value
    return { ...DEFAULT_WEIGHTS, ...parsed }
  } catch {
    return DEFAULT_WEIGHTS
  }
}

/* ── Are the current weights different from defaults? ─────────────────── */
export function hasCustomWeights(w: RiskWeights): boolean {
  return (Object.keys(DEFAULT_WEIGHTS) as (keyof RiskWeights)[]).some(
    key => Math.abs((w[key] ?? 0) - DEFAULT_WEIGHTS[key]) > 0.001
  )
}

/* ── Map score → risk level ──────────────────────────────────────────── */
function scoreToLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
  if (score >= 0.70) return 'critical'
  if (score >= 0.50) return 'high'
  if (score >= 0.30) return 'medium'
  return 'low'
}

/* ── Recompute a single SupplierRiskAnalysis with custom weights ──────── */
export function applyWeights(
  analysis: SupplierRiskAnalysis,
  weights: RiskWeights,
): SupplierRiskAnalysis {
  // If weights exactly match defaults, return as-is (avoids unnecessary object creation)
  if (!hasCustomWeights(weights)) return analysis

  const newFactors: Record<string, { value: number; weighted: number; explanation: string }> = {}
  let newOverall = 0

  for (const [name, factor] of Object.entries(analysis.factors ?? {})) {
    const w = weights[name as keyof RiskWeights] ?? DEFAULT_WEIGHTS[name as keyof RiskWeights] ?? 0
    const newWeighted = round4(factor.value * w)
    newFactors[name] = {
      value:       factor.value,
      weighted:    newWeighted,
      explanation: factor.explanation,
    }
    newOverall += newWeighted
  }

  newOverall = round4(Math.min(1, Math.max(0, newOverall)))

  return {
    ...analysis,
    overall_score: newOverall,
    risk_level:    scoreToLevel(newOverall),
    factors:       newFactors as SupplierRiskAnalysis['factors'],
  }
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

/* ── Hook ─────────────────────────────────────────────────────────────── */
/**
 * Drop-in replacement for `useRiskAnalysis()` that applies user-saved
 * weights from Settings before returning risk data.
 *
 * Returns the same shape as `useRiskAnalysis()` plus:
 *   - `weights`       — the currently active weight set
 *   - `isCustom`      — true when weights differ from defaults
 */
export function useWeightedRiskAnalysis() {
  const query = useRiskAnalysis()
  const weightsJson = useMemo(() => JSON.stringify(loadWeights()), [])
  const weights = useMemo(() => JSON.parse(weightsJson) as RiskWeights, [weightsJson])
  const isCustom = hasCustomWeights(weights)

  const data = useMemo(() => {
    if (!query.data) return query.data
    const raw = query.data as SupplierRiskAnalysis[]
    if (!isCustom) return raw
    return raw.map(a => applyWeights(a, weights))
  }, [query.data, isCustom, weights, weightsJson])

  return {
    ...query,
    data,
    weights,
    isCustom,
  }
}
