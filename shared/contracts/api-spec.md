# SupplySense API Contract

## Base URL
`/api/v1`

## Endpoints

### Dashboard
- `GET /dashboard/summary` → DashboardSummary

### Suppliers
- `GET /suppliers` → SupplierListResponse
- `GET /suppliers/{id}` → SupplierResponse
- `GET /suppliers/{id}/dependencies` → SupplierDependencyResponse[]
- `GET /suppliers/dependencies/all` → SupplierDependencyResponse[]

### SKUs
- `GET /skus` → SKUListResponse

### Disruptions
- `GET /disruptions/timeline` → DisruptionTimelineResponse
- `GET /disruptions/active` → DisruptionResponse[]

### Action Cards
- `GET /actions` → ActionCardListResponse
- `GET /actions/pending` → ActionCardResponse[]

### Events (SSE)
- `GET /events/stream` → Server-Sent Events

### Demo Scenarios
- `GET /scenarios/presets` → preset list
- `POST /scenarios/trigger/{preset_name}` → trigger result

### Health
- `GET /health` → { status, service }
