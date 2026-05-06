"""
In-process Metrics Store — CloudWatch-style observability for SupplySense.

Tracks:
- API request counts per endpoint
- Agent invocation counts per agent
- Bedrock call counts + latency histogram
- SSE active subscriber watermark
- Synthetic engine event emission rate

All data lives in process memory; resets on restart.
Exposed via GET /api/v1/health/metrics.
"""

import time
import threading
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import DefaultDict

_LOCK = threading.Lock()


@dataclass
class LatencySeries:
    """Rolling 1-minute latency window (last 60 samples)."""
    _samples: deque = field(default_factory=lambda: deque(maxlen=60))

    def record(self, duration_ms: float) -> None:
        with _LOCK:
            self._samples.append(duration_ms)

    @property
    def p50(self) -> float:
        s = sorted(self._samples)
        if not s:
            return 0.0
        return s[len(s) // 2]

    @property
    def p95(self) -> float:
        s = sorted(self._samples)
        if not s:
            return 0.0
        idx = int(len(s) * 0.95)
        return s[min(idx, len(s) - 1)]

    @property
    def count(self) -> int:
        return len(self._samples)


class MetricsStore:
    """
    Single global singleton that any module can import and record into.

    Usage:
        from app.core.metrics import metrics_store
        metrics_store.record_request("/risk/suppliers", 142.3)
        metrics_store.record_agent_call("supervisor")
    """

    def __init__(self) -> None:
        self._request_counts: DefaultDict[str, int] = defaultdict(int)
        self._request_latency: DefaultDict[str, LatencySeries] = defaultdict(LatencySeries)
        self._agent_counts: DefaultDict[str, int] = defaultdict(int)
        self._bedrock_calls: int = 0
        self._bedrock_latency: LatencySeries = LatencySeries()
        self._bedrock_fallback_calls: int = 0
        self._sse_connections_peak: int = 0
        self._sse_current: int = 0
        self._synthetic_events_total: int = 0
        self._start_time: float = time.time()

    # ── Request tracking ────────────────────────────────────────────────────

    def record_request(self, endpoint: str, duration_ms: float = 0.0) -> None:
        with _LOCK:
            # Normalize endpoint to strip UUIDs for grouping
            key = self._normalize(endpoint)
            self._request_counts[key] += 1
            self._request_latency[key].record(duration_ms)

    def _normalize(self, path: str) -> str:
        """Replace UUID segments with {id} for aggregation."""
        import re
        return re.sub(
            r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
            "{id}",
            path,
        )

    # ── Agent tracking ──────────────────────────────────────────────────────

    def record_agent_call(self, agent_name: str) -> None:
        with _LOCK:
            self._agent_counts[agent_name] += 1

    def record_bedrock_call(self, duration_ms: float, fallback: bool = False) -> None:
        with _LOCK:
            if fallback:
                self._bedrock_fallback_calls += 1
            else:
                self._bedrock_calls += 1
                self._bedrock_latency.record(duration_ms)

    # ── SSE tracking ────────────────────────────────────────────────────────

    def set_sse_count(self, n: int) -> None:
        with _LOCK:
            self._sse_current = n
            if n > self._sse_connections_peak:
                self._sse_connections_peak = n

    # ── Synthetic engine tracking ───────────────────────────────────────────

    def increment_synthetic_events(self) -> None:
        with _LOCK:
            self._synthetic_events_total += 1

    # ── Snapshot ────────────────────────────────────────────────────────────

    def snapshot(self) -> dict:
        uptime = round(time.time() - self._start_time, 1)
        total_requests = sum(self._request_counts.values())
        bedrock_total = self._bedrock_calls + self._bedrock_fallback_calls

        return {
            "uptime_seconds": uptime,
            "total_requests": total_requests,
            "requests_per_minute": round(total_requests / max(uptime / 60.0, 1), 1),
            "top_endpoints": sorted(
                [
                    {
                        "endpoint": k,
                        "count": v,
                        "p50_ms": round(self._request_latency[k].p50, 1),
                        "p95_ms": round(self._request_latency[k].p95, 1),
                    }
                    for k, v in self._request_counts.items()
                ],
                key=lambda x: -x["count"],
            )[:10],
            "agent_invocations": dict(self._agent_counts),
            "bedrock": {
                "total_calls": bedrock_total,
                "real_calls": self._bedrock_calls,
                "fallback_calls": self._bedrock_fallback_calls,
                "p50_latency_ms": round(self._bedrock_latency.p50, 1),
                "p95_latency_ms": round(self._bedrock_latency.p95, 1),
            },
            "sse": {
                "current_connections": self._sse_current,
                "peak_connections": self._sse_connections_peak,
            },
            "synthetic_events_emitted": self._synthetic_events_total,
        }


# Singleton instance imported by all modules
metrics_store = MetricsStore()
