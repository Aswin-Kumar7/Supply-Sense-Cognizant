"""
Backtesting framework for the prediction engine.

Runs labeled historical scenarios through the prediction engine and computes:
  - precision (of disruptions that were predicted, how many occurred)
  - recall    (of disruptions that occurred, how many were predicted)
  - F1 score
  - false alert rate (predicted but not occurred)
  - average lead time (days between prediction and actual disruption)

HONESTY CONTRACT
----------------
Backtesting can only be meaningful when run against REAL historical data with
labeled outcomes.  When using synthetic/seeded scenarios, all results carry:
  data_mode: "synthetic"
  is_real_historical_data: False
  interpretation: "scenario_exercise" (not "measured_performance")

No backtesting result based on synthetic data should be quoted as an
empirical performance figure.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class LabeledScenario:
    """One historical or synthetic scenario with a known outcome."""
    scenario_id: str
    supplier_id: str
    supplier_name: str
    risk_score: float
    signal_count: int
    # Ground truth: did a disruption actually occur within the horizon?
    disruption_occurred: bool
    # Days between the prediction date and the disruption event (None if no disruption)
    actual_lead_time_days: Optional[int] = None
    # "observed" | "synthetic"
    data_mode: str = "synthetic"


@dataclass
class BacktestResult:
    """
    Results of running the prediction engine against labeled scenarios.

    All numeric metrics are only meaningful when data_mode == "observed"
    and is_real_historical_data == True.  Synthetic backtests are useful
    for structural/integration testing only.
    """
    total_scenarios: int
    true_positives: int     # predicted AND occurred
    false_positives: int    # predicted but did NOT occur
    false_negatives: int    # NOT predicted but DID occur
    true_negatives: int     # NOT predicted and did NOT occur
    precision: float        # TP / (TP + FP); nan if TP+FP == 0
    recall: float           # TP / (TP + FN); nan if TP+FN == 0
    f1_score: float         # harmonic mean of precision and recall
    false_alert_rate: float # FP / (FP + TN)
    avg_lead_time_days: Optional[float]  # mean days of warning (TP only)
    # Honesty labels — must accompany all results
    is_real_historical_data: bool = False
    data_mode: str = "synthetic"
    interpretation: str = "scenario_exercise"


def _safe_div(num: float, den: float) -> float:
    return num / den if den != 0 else float("nan")


def run_backtest(
    scenarios: list,
    engine,
    threshold: float = 0.5,
    horizon_days: int = 14,
) -> BacktestResult:
    """
    Run the prediction engine over labeled scenarios and compute metrics.

    threshold:    probability at or above which a disruption is 'predicted'.
    engine:       a PredictionEngine instance.
    """
    tp = fp = fn = tn = 0
    lead_times: list = []
    has_observed = any(s.data_mode == "observed" for s in scenarios)

    for s in scenarios:
        pred = engine.predict_disruption(
            risk_score=s.risk_score,
            supplier_id=s.supplier_id,
            supplier_name=s.supplier_name,
            signal_count=s.signal_count,
            horizon_days=horizon_days,
        )
        predicted = pred.disruption_probability >= threshold
        occurred = s.disruption_occurred

        if predicted and occurred:
            tp += 1
            if s.actual_lead_time_days is not None:
                lead_times.append(s.actual_lead_time_days)
        elif predicted and not occurred:
            fp += 1
        elif not predicted and occurred:
            fn += 1
        else:
            tn += 1

    precision = _safe_div(tp, tp + fp)
    recall = _safe_div(tp, tp + fn)
    f1 = _safe_div(2 * precision * recall, precision + recall) if not (
        math.isnan(precision) or math.isnan(recall)
    ) else float("nan")
    far = _safe_div(fp, fp + tn)
    avg_lead = round(sum(lead_times) / len(lead_times), 1) if lead_times else None

    return BacktestResult(
        total_scenarios=len(scenarios),
        true_positives=tp,
        false_positives=fp,
        false_negatives=fn,
        true_negatives=tn,
        precision=round(precision, 4) if not math.isnan(precision) else float("nan"),
        recall=round(recall, 4) if not math.isnan(recall) else float("nan"),
        f1_score=round(f1, 4) if not math.isnan(f1) else float("nan"),
        false_alert_rate=round(far, 4) if not math.isnan(far) else float("nan"),
        avg_lead_time_days=avg_lead,
        is_real_historical_data=has_observed,
        data_mode="observed" if has_observed else "synthetic",
        interpretation="measured_performance" if has_observed else "scenario_exercise",
    )


# ── Built-in synthetic exercise scenarios ─────────────────────────────────────
# These are structural/integration tests only.  Never quote these numbers as
# production accuracy figures.

SYNTHETIC_EXERCISE_SCENARIOS: list = [
    LabeledScenario("E01", "sup-1", "Alpha Textiles",    0.82, 4, True,  10, "synthetic"),
    LabeledScenario("E02", "sup-2", "Beta Electronics",  0.71, 2, True,   7, "synthetic"),
    LabeledScenario("E03", "sup-3", "Gamma Pharma",      0.65, 1, True,  14, "synthetic"),
    LabeledScenario("E04", "sup-4", "Delta Logistics",   0.58, 0, False, None, "synthetic"),
    LabeledScenario("E05", "sup-5", "Epsilon Foods",     0.45, 3, False, None, "synthetic"),
    LabeledScenario("E06", "sup-6", "Zeta Chemicals",    0.30, 0, False, None, "synthetic"),
    LabeledScenario("E07", "sup-7", "Eta Components",    0.25, 1, False, None, "synthetic"),
    LabeledScenario("E08", "sup-8", "Theta Textiles",    0.88, 5, True,   3, "synthetic"),
    LabeledScenario("E09", "sup-9", "Iota Rubber",       0.15, 0, False, None, "synthetic"),
    LabeledScenario("E10", "sup-10","Kappa Steel",       0.90, 6, True,   5, "synthetic"),
]
