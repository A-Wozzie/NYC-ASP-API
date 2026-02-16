# NYC Alternate Side Parking API Guide

## Base URL

**Local:** `http://localhost:3000`
**Production:** `https://your-service.onrender.com` (update after deploy)

---

## Authentication

All `/api/*` endpoints require a Bearer token in the `Authorization` header:

```
Authorization: Bearer <API_TOKEN>
```

The `/health` endpoint is unauthenticated.

---

## Endpoints

### GET `/api/parking`

Returns parking status for both today and tomorrow in a single response. Best for clients that want to display both days (e.g., iOS widget).

**Response:**

```json
{
  "lastFetched": "2026-02-16T17:24:56.004Z",
  "today": {
    "date": "20260216",
    "status": "SUSPENDED",
    "details": "Alternate side parking is suspended for Washington's Birthday...",
    "exceptionName": "Washington's Birthday (Presidents' Day) and Lunar New Year's Eve 2026"
  },
  "tomorrow": {
    "date": "20260217",
    "status": "SUSPENDED",
    "details": "Alternate side parking is suspended for Lunar New Year.",
    "exceptionName": "Lunar New Year 2026"
  }
}
```

---

### GET `/api/parking/today`

Returns parking status for today only, as a flat object.

**Response:**

```json
{
  "lastFetched": "2026-02-16T17:24:56.004Z",
  "date": "20260216",
  "status": "SUSPENDED",
  "details": "Alternate side parking is suspended for Washington's Birthday...",
  "exceptionName": "Washington's Birthday (Presidents' Day) and Lunar New Year's Eve 2026"
}
```

---

### GET `/api/parking/tomorrow`

Returns parking status for tomorrow only, as a flat object. Same shape as `/api/parking/today`.

---

### GET `/api/status`

Returns the full cached NYC API response, including all three services (parking, collections, schools) for both days. Useful for debugging or if you expand the app to show more than parking.

**Response:**

```json
{
  "lastFetched": "2026-02-16T17:24:56.004Z",
  "data": {
    "days": [
      {
        "today_id": "20260216",
        "items": [
          {
            "type": "Alternate Side Parking",
            "status": "SUSPENDED",
            "details": "Alternate side parking is suspended for...",
            "exceptionName": "Washington's Birthday..."
          },
          {
            "type": "Collections",
            "status": "SUSPENDED",
            "details": "Trash, recycling, and compost collections are suspended...",
            "exceptionName": "Washington's Birthday..."
          },
          {
            "type": "Schools",
            "status": "CLOSED",
            "details": "Public schools are closed for Midwinter Recess.",
            "exceptionName": "Midwinter Recess 2026"
          }
        ]
      },
      {
        "today_id": "20260217",
        "items": [ ... ]
      }
    ]
  }
}
```

---

### GET `/health`

No authentication required. Returns service health info.

**Response:**

```json
{
  "status": "ok",
  "lastFetched": "2026-02-16T17:24:56.004Z",
  "consecutiveErrors": 0,
  "lastError": null,
  "uptime": 185.07
}
```

---

## Field Reference

### Parking object

| Field | Type | Description |
|---|---|---|
| `date` | string | Date in `YYYYMMDD` format |
| `status` | string | Current status (see values below) |
| `details` | string | Human-readable description of the status |
| `exceptionName` | string or null | Name of the holiday/event causing the exception, or `null` on normal days |

### Known `status` values

| Value | Meaning |
|---|---|
| `IN EFFECT` | Normal rules apply — move your car |
| `SUSPENDED` | Rules suspended (holiday, snow, emergency) — you can stay parked |
| `NOT IN EFFECT` | Rules not active (Sundays) |

### Top-level fields

| Field | Type | Description |
|---|---|---|
| `lastFetched` | string | ISO 8601 timestamp of the last successful poll to the NYC API |

---

## Error Responses

| Status | Body | Meaning |
|---|---|---|
| `401` | `{ "error": "Missing Authorization header" }` | No `Authorization` header sent |
| `403` | `{ "error": "Invalid or expired token" }` | Token doesn't match |
| `503` | `{ "error": "No data available yet", "message": "..." }` | Service just started or NYC API is down |

---

## Polling Behavior

The service fetches from the NYC 311 API every 2 minutes. The `lastFetched` field in every response tells you exactly when the data was last refreshed. On a service restart, the first fetch happens immediately on startup.

---

## Quick Reference (curl)

```bash
# Today's parking status
curl -H 'Authorization: Bearer <TOKEN>' http://localhost:3000/api/parking/today

# Tomorrow's parking status
curl -H 'Authorization: Bearer <TOKEN>' http://localhost:3000/api/parking/tomorrow

# Both days
curl -H 'Authorization: Bearer <TOKEN>' http://localhost:3000/api/parking

# Full calendar (all services)
curl -H 'Authorization: Bearer <TOKEN>' http://localhost:3000/api/status

# Health check (no auth)
curl http://localhost:3000/health
```
