"""
Demo Scenario Trigger Framework.

Supports controlled business simulations:
- Chennai cyclone
- Maharashtra transport strike
- Kolkata flood disruption
- Diwali seasonal overload

Each scenario:
- Activates biased event generation in the synthetic engine
- Publishes an immediate high-severity alert
- Updates supplier states (via event propagation)
- Streams cascading effects to the frontend
"""

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from app.core.database import AsyncSessionLocal
from app.core.event_bus import event_bus, SupplyChainEvent
from app.core.logging import logger
from app.services.synthetic_engine import synthetic_engine

router = APIRouter(prefix="/scenarios", tags=["Demo Scenarios"])


class ScenarioResponse(BaseModel):
    status: str
    scenario: str
    message: str


SCENARIO_PRESETS = {
    "cyclone_chennai": {
        "name": "Chennai Cyclone",
        "description": "Cyclone Michaung disrupts South India coastal logistics",
        "severity": "critical",
        "region": "South",
        "affected_suppliers": 5,
        "estimated_duration_hours": 72,
        "alert_message": "🌀 CRITICAL: Cyclone Michaung making landfall near Chennai. All coastal logistics suspended.",
    },
    "strike_maharashtra": {
        "name": "Maharashtra Transport Strike",
        "description": "Truckers union strike halts Western corridor logistics",
        "severity": "high",
        "region": "West",
        "affected_suppliers": 4,
        "estimated_duration_hours": 48,
        "alert_message": "🚛 HIGH: Maharashtra transport union declares indefinite strike. Mumbai-Pune corridor blocked.",
    },
    "flood_kolkata": {
        "name": "Kolkata Flood Disruption",
        "description": "Severe flooding disrupts Eastern supply chain hub",
        "severity": "critical",
        "region": "East",
        "affected_suppliers": 3,
        "estimated_duration_hours": 96,
        "alert_message": "🌊 CRITICAL: Severe flooding in Kolkata. Eastern warehouse district submerged.",
    },
    "diwali_surge": {
        "name": "Diwali Demand Surge",
        "description": "Pan-India festival demand spike across FMCG categories",
        "severity": "high",
        "region": "All India",
        "affected_suppliers": 12,
        "estimated_duration_hours": 168,
        "alert_message": "🪔 HIGH: Diwali demand surge detected. FMCG orders up 180% across all regions.",
    },
}


@router.get("/presets")
async def list_scenario_presets():
    """List available demo scenario presets with descriptions."""
    return {
        "presets": {
            key: {
                "name": val["name"],
                "description": val["description"],
                "severity": val["severity"],
                "region": val["region"],
                "affected_suppliers": val["affected_suppliers"],
            }
            for key, val in SCENARIO_PRESETS.items()
        },
        "active_scenario": synthetic_engine._scenario_active,
    }


async def _run_supervisor_and_publish(preset_name: str, preset: dict):
    """
    Background task: run Supervisor Agent for a scenario and publish the
    resulting ActionCard payload via SSE so the frontend picks it up.
    """
    try:
        from app.agents.strands_agents import SupervisorAgent

        async with AsyncSessionLocal() as db:
            supervisor = SupervisorAgent(db)
            action_card = await supervisor.process_scenario(preset_name, preset)

        await event_bus.publish(SupplyChainEvent(
            event_type="action_generated",
            severity=preset["severity"],
            message=action_card.get("title", f"Action card generated for {preset['name']}"),
            data=action_card,
        ))
        logger.info(f"Supervisor Agent produced ActionCard for scenario: {preset_name}")
    except Exception as exc:
        logger.warning(f"Supervisor Agent failed for scenario {preset_name}: {exc}")


@router.post("/trigger/{preset_name}", response_model=ScenarioResponse)
async def trigger_scenario(preset_name: str, background_tasks: BackgroundTasks):
    """
    Trigger a preset demo scenario.

    This will:
    1. Publish an immediate critical alert event via SSE
    2. Activate biased event generation in the synthetic engine
    3. Run the Supervisor Agent in the background
    4. Stream the resulting ActionCard to all connected dashboards
    """
    if preset_name not in SCENARIO_PRESETS:
        return ScenarioResponse(
            status="error",
            scenario=preset_name,
            message=f"Unknown preset: {preset_name}. Available: {list(SCENARIO_PRESETS.keys())}",
        )

    preset = SCENARIO_PRESETS[preset_name]

    # Publish immediate alert
    alert_event = SupplyChainEvent(
        event_type="scenario_triggered",
        severity=preset["severity"],
        message=preset["alert_message"],
        data={
            "scenario": preset_name,
            "region": preset["region"],
            "affected_suppliers": preset["affected_suppliers"],
            "estimated_duration_hours": preset["estimated_duration_hours"],
        },
    )
    await event_bus.publish(alert_event)

    # Activate scenario bias in synthetic engine
    synthetic_engine.activate_scenario(preset_name)

    # Run Supervisor Agent pipeline in background and push ActionCard via SSE
    background_tasks.add_task(_run_supervisor_and_publish, preset_name, preset)

    logger.info(f"Scenario triggered: {preset_name} ({preset['name']})")
    return ScenarioResponse(
        status="active",
        scenario=preset_name,
        message=f"Scenario '{preset['name']}' activated. Supervisor Agent processing pipeline started.",
    )


@router.post("/deactivate")
async def deactivate_scenario():
    """Deactivate current scenario and return to normal event generation."""
    current = synthetic_engine._scenario_active
    synthetic_engine.deactivate_scenario()

    # Publish deactivation event
    await event_bus.publish(SupplyChainEvent(
        event_type="scenario_deactivated",
        severity="low",
        message=f"Scenario '{current}' deactivated. Returning to normal operations.",
        data={"previous_scenario": current or "none"},
    ))

    return {"status": "deactivated", "previous_scenario": current}


@router.post("/speed/{mode}")
async def set_event_speed(mode: str):
    """
    Adjust synthetic event generation speed for demos.
    Modes: slow (5-10s), normal (2-6s), fast (0.5-2s), turbo (0.2-0.8s)
    """
    speeds = {
        "slow": (5.0, 10.0),
        "normal": (2.0, 6.0),
        "fast": (0.5, 2.0),
        "turbo": (0.2, 0.8),
    }
    if mode not in speeds:
        raise HTTPException(status_code=400, detail=f"Unknown mode. Available: {list(speeds.keys())}")

    min_s, max_s = speeds[mode]
    synthetic_engine.set_interval(min_s, max_s)
    return {"status": "updated", "mode": mode, "interval": f"{min_s}-{max_s}s"}
