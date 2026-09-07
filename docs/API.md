# API Reference

Base URL: `/api/v1`

## Conventions

**Success**

```json
{ "success": true, "message": "OK", "data": { } }
```

**Paginated success**

```json
{
  "success": true,
  "data": [],
  "pagination": { "page": 1, "limit": 20, "total": 0, "totalPages": 0, "hasNextPage": false }
}
```

Some list endpoints add a sibling key alongside `data`: `summary` (money totals), `byResult` (fraud counts) or `flaggedEvents`.

**Error**

```json
{ "success": false, "message": "Validation failed", "details": [{ "path": "vehicleNumber", "message": "..." }] }
```

| Status | Meaning |
| --- | --- |
| 400 | Malformed request or a rule violation (past entry time, next-day booking) |
| 401 | Missing, invalid or expired token |
| 403 | Authenticated but not permitted (wrong role, another owner's facility) |
| 404 | Not found |
| 409 | Conflict (no slots left, overlapping booking, lock contention) |
| 422 | Schema validation failed — `details` lists the offending fields |
| 429 | Rate limit reached |
| 502/503/504 | Upstream gateway (Razorpay, Gemini) unreachable or slow |

**Authentication.** Send `Authorization: Bearer <accessToken>`. Access tokens are short-lived (15m default); use `POST /auth/refresh` with the refresh token. Changing a password or deactivating an account bumps `tokenVersion`, invalidating every issued token immediately.

**Gate devices.** `POST /recognition/entry` and `/exit` accept either a signed-in `owner`/`admin` token or an unattended device key in `X-Camera-Key` (optionally with `X-Camera-Id`).

**Roles.** `user` (driver), `owner` (parking operator), `admin` (platform administrator).

---

## Health

### `GET /health`
Unauthenticated. Returns 200 when MongoDB is connected, 503 otherwise.

```json
{
  "success": true,
  "status": "ok",
  "dependencies": {
    "mongodb": "connected",
    "redis": "unavailable",
    "gemini": "not_configured",
    "razorpay": "mock_mode"
  }
}
```

Redis, Gemini and Razorpay are reported but do not affect the status code — the API keeps serving without them, with reduced capability.

---

## Auth

### `POST /auth/register`
Public. Rate limited.

```json
{
  "name": "Arjun Sharma",
  "email": "arjun@example.com",
  "password": "Strong@123",
  "phone": "+91 99000 11111",
  "role": "user",
  "businessName": "Owner accounts only",
  "gstNumber": "optional",
  "address": "optional"
}
```

`role` accepts `user` or `owner` only — admins are provisioned by seeding. Password must be 8+ characters with an upper case letter, a lower case letter and a digit. Registering as `owner` also creates a `parkingOwners` business profile.

Returns `{ user, ownerProfile, tokens: { accessToken, refreshToken, expiresIn } }`.

### `POST /auth/login`
`{ "email": "...", "password": "..." }` → `{ user, ownerProfile?, tokens }`.
Unknown email and wrong password return the same 401 message.

### `POST /auth/refresh`
`{ "refreshToken": "..." }` → a fresh token pair.

### `GET /auth/me` · `PATCH /auth/me`
Authenticated. PATCH accepts `name` and/or `phone`.

### `POST /auth/change-password`
`{ "currentPassword": "...", "newPassword": "..." }`. Invalidates every other session and returns a new token pair so the caller stays signed in.

---

## Users

### `GET /users/dashboard`
Authenticated. One call for the driver home screen: stats, the active session, upcoming bookings, and recent bookings / sessions / transactions.

### `GET /users/owner-profile` · `PATCH /users/owner-profile`
Owner only. Business name, contact, GST, address and payout details (only the last four account digits are stored).

---

## Parking

### `GET /parking/search`
Public (auth optional). Returns approved facilities only.

| Query | Notes |
| --- | --- |
| `latitude`, `longitude` | Both or neither. Enables geo search and `distanceKm` in results |
| `radiusKm` | 0.1–50, default 5 |
| `city`, `q` | Alternative to coordinates; at least one of coordinates / `city` / `q` is required |
| `vehicleType` | `two_wheeler` \| `four_wheeler` |
| `evCharging`, `open24x7`, `availableOnly` | `"true"` / `"false"` |
| `minRating`, `maxRate` | `maxRate` needs `vehicleType` |
| `sortBy` | `distance` (default) \| `rate` \| `rating` \| `availability` |
| `page`, `limit` | limit ≤ 100 |

Geo search uses a `2dsphere` index via `$geoNear`, so distance is computed by MongoDB. Results are cached for 60s.

Each item carries `available`, `capacity`, `hourlyRate`, `amenities`, `rating`, `occupancyRate`, `isOpenNow` and (for geo search) `distanceKm`.

### `GET /parking/:id`
Public. Full facility detail plus `indicativeRates` — the live dynamic rate per vehicle type, with the active multiplier and any peak windows currently in force.

### `GET /parking/:id/availability?vehicleType=`
Public. Live capacity/occupied/reserved/available. Cached 30s.

### `GET /parking/mine`
Owner/admin. Query: `status`, `page`, `limit`.

### `POST /parking`
Owner/admin. Creates a facility in `pending` status and seeds a default pricing rule.

```json
{
  "name": "MG Road Multilevel Parking",
  "description": "optional",
  "contact": { "email": "ops@example.com", "phone": "+91 98450 11111" },
  "location": {
    "address": "12 MG Road, Bengaluru",
    "city": "Bengaluru",
    "state": "Karnataka",
    "pincode": "560001",
    "latitude": 12.9757,
    "longitude": 77.6068
  },
  "capacity": { "two_wheeler": 60, "four_wheeler": 120 },
  "hourlyRate": { "two_wheeler": 20, "four_wheeler": 50 },
  "operatingHours": { "is24x7": false, "openTime": "06:00", "closeTime": "23:00" },
  "amenities": { "evCharging": true, "covered": true, "security": true, "cctv": true },
  "pricing": { "dynamicPricingEnabled": true, "overstayMultiplier": 1.5, "graceMinutes": 10, "minChargeHours": 1 }
}
```

Rejected if total capacity is zero, or if a vehicle type has capacity but no rate.

### `PATCH /parking/:id`
Owner (own facility) or admin. Every field is optional. **Capacity cannot be reduced below `occupied + reserved`** — that would drive availability negative and start refusing valid bookings (409).

### `GET /parking/:id/manage`
Owner/admin. Facility plus its pricing rule, active session count and upcoming booking count.

### `POST /parking/:id/recount`
Owner/admin. Recomputes `occupied`/`reserved` from the sessions and bookings that actually exist. A safety valve for drift after an interrupted write.

---

## Pricing

### `POST /pricing/quote`
Public. Prices a prospective booking without creating anything.

```json
{
  "parkingLotId": "…",
  "vehicleType": "four_wheeler",
  "expectedEntryTime": "2026-09-07T10:00:00.000Z",
  "expectedExitTime": "2026-09-07T12:00:00.000Z"
}
```

Response includes `baseRatePerHour`, `effectiveRatePerHour`, `durationHours`, `amount`, a `multipliers` object (`occupancy`, `peakHour`, `location`, `dayOfWeek`, `combined`, and `cappedFrom` when the clamp bit), a `factors` object naming the active peak windows and zone, and a human-readable `breakdown`.

### `GET /pricing/rules/:id` · `PUT /pricing/rules/:id`
Owner/admin. The four dynamic-pricing factors:

```json
{
  "isActive": true,
  "occupancyTiers": [
    { "upTo": 0.5, "multiplier": 1.0 },
    { "upTo": 1.0, "multiplier": 1.5 }
  ],
  "peakHours": [
    { "label": "Evening rush", "startTime": "17:00", "endTime": "21:00", "multiplier": 1.3, "days": [1,2,3,4,5] }
  ],
  "locationFactor": { "zoneLabel": "cbd" },
  "dayOfWeekMultipliers": [1.1, 1, 1, 1, 1, 1.05, 1.15],
  "limits": { "minMultiplier": 0.5, "maxMultiplier": 2.5 }
}
```

`dayOfWeekMultipliers` is Sunday-first and must hold exactly 7 values. The highest occupancy tier must reach `upTo: 1`. An empty `days` array means every day.

### `POST /pricing/rules/:id/simulate`
Owner/admin. `{ vehicleType, occupancyRate?, date? }` → a 24-point hourly price curve under the **saved** rules, for judging a change before committing it.

---

## Bookings

### `POST /bookings`
Driver only. Creates the reservation, holds the slot, and returns a payment order.

```json
{
  "parkingLotId": "…",
  "vehicleNumber": "KA01AB1234",
  "vehicleType": "four_wheeler",
  "expectedEntryTime": "2026-09-07T10:00:00.000Z",
  "durationHours": 2
}
```

Give either `durationHours` (1–24) or `expectedExitTime`. Rules enforced:

- Current day only — a next-day entry or exit is rejected (400).
- Entry time may not be in the past beyond a 15-minute tolerance (400).
- The facility must be open at both entry and exit time (400).
- One vehicle may not hold two overlapping bookings anywhere, including unpaid holds (409).
- A slot must be free — checked and taken inside a distributed lock (409).

Returns `{ booking, payment }`. The booking starts as `pending_payment` and the slot is already held. Outside production with no Razorpay keys, `payment` carries `mock: true` plus `mockPaymentId` and `mockSignature` so the flow can be completed locally.

Booking statuses: `pending_payment` → `confirmed` → `active` (vehicle inside) → `completed`; or `payment_failed`.

### `GET /bookings/mine`
Authenticated. Query: `status`, `page`, `limit`.

### `GET /bookings/:id`
Accepts the Mongo id **or** the human booking code (`BK-XXXXXXXX`). Visible to the booking's driver, the facility's owner, or an admin.

### `GET /bookings/lot/:id`
Owner/admin. Query: `status`, `from`, `to`, `vehicleNumber`, `page`, `limit`.

---

## Sessions

### `GET /sessions/mine`
Authenticated. Query: `status`, `page`, `limit`.

### `GET /sessions/lot/:id`
Owner/admin. Adds `vehicleNumber` search. Active rows carry `liveOverstayMinutes` and `isOverstaying`.

### `GET /sessions/:id`
Accepts the Mongo id or the session code (`PS-XXXXXXXX`). Closed sessions include a full `receipt`.

### `GET /sessions/:id/preview-bill`
The bill as it would stand **right now**, without closing the session — what a driver sees while parked and running late.

---

## Payments

### `GET /payments/config`
Public. `{ keyId, currency, mockMode }` — everything the checkout script needs, and nothing secret.

### `POST /payments/booking-order`
Driver. `{ "bookingId": "BK-…" }`. Creates or reuses the payment order for a booking still awaiting payment, so a failed attempt can be retried against the same booking rather than making a new one. A `payment_failed` booking re-acquires its slot first (409 if it has since been taken).

### `POST /payments/session-order`
Driver. `{ "sessionId": "PS-…" }`. Payment order for an unpaid overstay balance.

### `POST /payments/verify`
Driver. The checkout callback.

```json
{
  "razorpayOrderId": "order_…",
  "razorpayPaymentId": "pay_…",
  "razorpaySignature": "…"
}
```

The server verifies the HMAC in constant time and, with real keys, re-fetches the payment from Razorpay to confirm its status and amount — a forged amount or an uncaptured payment cannot pass. On success the booking is confirmed or the session settled. **Idempotent**: replaying returns the already-paid transaction.

### `POST /payments/failed`
Driver. `{ razorpayOrderId, reason? }`. Records the failure and releases the held slot.

### `GET /payments/mine` · `GET /payments/mine/dues`
Transaction history (`purpose`, `status`, `page`, `limit`), and outstanding overstay balances with a total.

### `GET /payments/lot/:id`
Owner/admin. Facility ledger with a `summary` of gross, platform commission and owner earnings.

### `POST /payments/webhook`
Razorpay only. Signature verified over the **raw** request body, so this route is mounted before the JSON parser. Handles `payment.captured` and `payment.failed`, and is the safety net for callbacks the browser never delivered. Unknown orders are acknowledged with 200 so Razorpay stops retrying.

---

## Recognition (gate)

### `POST /recognition/entry` · `POST /recognition/exit`
Camera device key or owner/admin token. Rate limited to 30/min per device, because each call costs a Gemini request.

Accepts a capture in any of three forms:

| Form | Field |
| --- | --- |
| Multipart upload | `image` (JPEG/PNG/WebP, ≤ 8 MB) |
| JSON data URL | `imageBase64` (what a browser webcam sends) |
| Manual entry | `manualPlate` — the fallback when a plate is genuinely unreadable |

Always include `parkingLotId`; `cameraId` is optional.

**Responses are 200 even when the barrier stays shut** — a refusal is a valid gate outcome, not a failed request. Read `data.allowed` and `data.result`.

| `result` | Meaning |
| --- | --- |
| `verified` | Plate matched; session opened (entry) or closed (exit) |
| `duplicate_event` | Camera fired twice; the existing session is returned |
| `no_booking` | No confirmed booking for this plate at this facility |
| `outside_entry_window` | Booked here, but too early or too late |
| `plate_mismatch` | Resembles a booking here but is not it — **flagged as fraud** |
| `unreadable_plate` | Below the confidence threshold |
| `no_active_session` | Exit attempted with no open session — **flagged as fraud** |

An entry response carries `booking` and `session`. An exit response adds `bill`, `receipt` and, when money is owed, a `payment` order. Every capture is written to `vehicleRecognitionEvents` regardless of outcome; images are never persisted.

### `POST /recognition/preview`
Owner/admin. Reads a plate without deciding anything — useful for aiming and calibrating a camera.

### `GET /recognition/status`
Owner/admin. Whether Gemini is configured, the confidence threshold, entry grace windows and accepted MIME types.

### `GET /recognition/events/:id`
Owner/admin. The facility's gate audit trail. Query: `eventType`, `result`, `flaggedOnly`, `page`, `limit`.

---

## Analytics

All accept `range`: `today` | `7d` | `30d` | `90d` | `all`. Cached 120s.

### `GET /analytics/owner`
Owner/admin. Optional `lotId` scopes it to one facility. Returns current occupancy, active sessions, all-time and windowed revenue with the commission split, a gap-filled daily series, average parking duration and overstay rate, a 24-bucket arrivals-by-hour distribution, booking counts by status, and flagged gate events.

### `GET /analytics/lot/:id`
Owner/admin. The single-facility card set: current occupancy, vehicles parked, available slots, revenue, reservations and average duration.

### `GET /analytics/platform`
Admin. Everything above platform-wide, plus user counts by role, facility counts by status, pending approvals, and the top five facilities by revenue.

---

## Admin

Every route requires the `admin` role.

### `GET /admin/users`
Query: `role`, `isActive` (`"true"`/`"false"`), `q` (name/email/phone), `page`, `limit`. Owner rows include their facility count; driver rows include booking count and total spend.

### `GET /admin/users/:id`
Full detail: the owner's business profile and facilities, or the driver's recent bookings and session count.

### `PATCH /admin/users/:id/status`
`{ "isActive": false }`. Bumps `tokenVersion` so existing tokens stop working immediately. Deactivating an owner also moves their approved facilities to `deactivated`, taking them out of driver search. Admins cannot deactivate themselves or other admins.

### `GET /admin/lots`
Query: `status`, `city`, `q`, `ownerId`, `page`, `limit`.

### `POST /admin/lots/:id/review`

```json
{ "decision": "approve", "reason": "optional", "commissionPercent": 12 }
```

`decision` is `approve` | `reject` | `deactivate` | `reactivate`. Approval makes the facility visible in driver search and marks the owner's business profile verified. `commissionPercent` (approve only) sets a per-facility override. **Deactivation is refused with 409 while vehicles are still parked** at that facility.

### `PUT /admin/commission`
`{ "commissionPercent": 10, "lotId": "optional" }`. With `lotId`, sets that facility's override. Without it, **clears every per-facility override** so all facilities fall back to the platform default — the default itself is the `PLATFORM_COMMISSION_PERCENT` environment variable, since it must be known before any request is served.

### `GET /admin/transactions`
Query: `status`, `purpose`, `lotId`, `userId`, `from`, `to`, `page`, `limit`. Includes a `summary` of gross, commission and owner payouts.

### `GET /admin/activity`
Every vehicle currently inside any facility, with live parked minutes and an `isOverstaying` flag, plus the 20 most recent flagged gate events.

### `GET /admin/fraud`
Query: `from`, `to`, `page`, `limit`. Flagged gate events with the recognised plate, the booked plate, and the similarity score, plus a `byResult` breakdown.

---

## Data model

| Collection | Holds |
| --- | --- |
| `users` | Credentials, role, `tokenVersion` for all three roles |
| `parkingOwners` | Operator business profile (login lives in `users`) |
| `parkingLots` | Capacity, rates, GeoJSON location, occupied/reserved counters, approval status |
| `bookings` | Reservation, vehicle, window, **frozen price snapshot**, fraud flags |
| `parkingSessions` | Actual entry/exit, duration, overstay, final bill |
| `transactions` | Payment ledger with the commission split recorded at capture time |
| `pricingRules` | Per-facility dynamic-pricing configuration |
| `vehicleRecognitionEvents` | Every gate capture and its decision |

Indexes worth knowing: `parkingLots` has a `2dsphere` index on `location.geo` and a compound `(status, city)`; `bookings` is indexed on `(parkingLot, vehicleNumberNormalized, status, expectedEntryTime)` for the entry lookup; `parkingSessions` on `(parkingLot, vehicleNumberNormalized, status)` for the exit lookup.

Plates are stored twice — as typed, and normalised to letters and digits only. Every comparison runs against the normalised form.
