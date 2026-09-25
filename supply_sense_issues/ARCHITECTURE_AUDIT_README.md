# Architecture Audit README

## Scope

This document is the cross-cutting audit summary for the system.

It ties together:

- backend
- frontend
- Strands / Bedrock AI
- eventing
- caching
- persistence

## System Summary

SupplySense is a layered supply-chain risk platform:

- the backend computes the facts
- the AI layer turns facts into readable recommendations
- the frontend visualizes and acts on the results
- SSE keeps the experience live

## Cross-Cutting Architecture

### Source of Truth

- risk scores are deterministic
- stockout forecasts are deterministic
- cascade propagation is deterministic
- financial exposure is deterministic
- AI is used for reasoning and phrasing

### Real-Time Transport

- SSE is the live transport
- event bus is in-process pub/sub
- frontend invalidates query caches on event arrival

### Caching

- React Query caches read APIs on the frontend
- procurement AI responses are cached on the backend
- the procurement cache has both hot and warm layers

### Observability

- health endpoint reports subsystem status
- metrics endpoint reports request, agent, Bedrock, SSE, and synthetic activity
- agent trace endpoint exposes recent tool-call history

Files:

- [backend/app/routers/health.py](X:/Hackathons/Cognizant/project/supplysense/backend/app/routers/health.py)
- [backend/app/core/metrics.py](X:/Hackathons/Cognizant/project/supplysense/backend/app/core/metrics.py)
- [backend/app/routers/events.py](X:/Hackathons/Cognizant/project/supplysense/backend/app/routers/events.py)

## Architecture Audit Notes

### Good

- Clean separation between API, services, repositories, and engines.
- Deterministic math is isolated from LLM behavior.
- UI data flow is centralized and easy to reason about.
- Real-time updates are not bolted on at the component level.

### Watch Outs

- In-memory stores will reset on restart.
- Fallback behavior is still present in code even where documentation says it was removed.
- SSE and Bedrock are external operational dependencies.
- If backend payload shapes drift, many frontend pages can break at once.

## Recommended Reading Order

1. [BACKEND_ARCHITECTURE_README.md](X:/Hackathons/Cognizant/project/supplysense/BACKEND_ARCHITECTURE_README.md)
2. [FRONTEND_ARCHITECTURE_README.md](X:/Hackathons/Cognizant/project/supplysense/FRONTEND_ARCHITECTURE_README.md)
3. [STRANDS_AI_README.md](X:/Hackathons/Cognizant/project/supplysense/STRANDS_AI_README.md)
4. [ENDPOINT_FLOW_README.md](X:/Hackathons/Cognizant/project/supplysense/ENDPOINT_FLOW_README.md)

