# Smart Parking Management System

A parking platform that connects facilities with drivers. Drivers search by location, pre-book a slot, and pay. At the gate, a camera captures the number plate, the **Gemini Vision API** reads it on the server, and the system verifies it against the booking to open the barrier. At exit the same read closes the session, computes the real parking duration, and bills any overstay automatically.

Built as a **modular monolith**: one Node.js/Express process containing eleven logical modules that talk to each other only through their service layers.

---

## Contents

- [What it does](#what-it-does)
- [Architecture](#architecture)
- [Running it](#running-it)
- [Demo accounts](#demo-accounts)
- [How the core flows work](#how-the-core-flows-work)
- [Dynamic pricing](#dynamic-pricing)
- [Overstay billing](#overstay-billing)
- [Concurrency and Redis](#concurrency-and-redis)
- [Security](#security)
- [Project layout](#project-layout)
- [Testing](#testing)
- [API reference](#api-reference)
- [Deliberate design decisions](#deliberate-design-decisions)

---

## What it does

### Driver panel
Register and sign in, manage a profile, search facilities by location with distance/price/rating/availability sorting, filter on EV charging and 24/7 access, see a live dynamic price before paying, book for the current day, pay through Razorpay, and review booking, session and payment history including any outstanding overstay charges.

### Parking owner panel
Register facilities (pending platform approval), configure capacity and per-vehicle-type rates, set operating hours, tune the four dynamic-pricing factors with a live 24-hour price simulation, manage EV charging and amenities, watch reservations and live sessions, review the transaction ledger with the commission split, read the gate recognition audit trail, and operate the entry/exit gate from a browser terminal.

### Platform admin panel
Manage drivers and owners, approve/reject/deactivate facilities, set per-facility commission, monitor every transaction, watch live parking activity across the platform, and review the fraud report of flagged gate events.

---

## Architecture

```
                        React SPA (Vite)
                              │
                          Nginx :80
                    ┌─────────┴─────────┐
              static assets        /api proxy
                                        │
                            Node.js / Express :5000
                                        │
        ┌───────────┬───────────┬───────┴────┬────────────┬────────────┐
        │           │           │            │            │            │
      Auth       Users      Parking      Booking      Pricing      Session
        │           │           │            │            │            │
        ├────────── Billing ────┼── Payment ─┼── Recognition ──────────┤
        │                       │            │                         │
        └────────── Analytics ──┴─── Admin ──┴─────────────────────────┘
                                        │
                            ┌───────────┴───────────┐
                            ▼                       ▼
                        MongoDB                   Redis
                   (source of truth)      (cache, locks, rate limit)
                                        │
                            ┌───────────┴───────────┐
                            ▼                       ▼
                    Gemini Vision API         Razorpay API
```

These are **logical modules inside one process**, not separately deployable services. Each lives in `backend/src/modules/<name>/` with its own routes, controller, service and validation. A module reaches another only through its exported service functions, so the boundaries stay real even though everything shares a process and a database.

**Why a monolith:** the domain is small and tightly coupled — a booking, its payment, its session and its bill are one transaction-shaped story. Splitting them across services would buy distributed-transaction problems in exchange for deployment independence nobody needs yet. The module boundaries are where the seams would go if that changes.

---

## Running it

### Option A — Docker (everything, one command)

```bash
cp .env.example .env
# Fill in JWT_ACCESS_SECRET, JWT_REFRESH_SECRET and CAMERA_API_KEY.
# Generate secrets with:
#   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

docker compose up --build
```

Open <http://localhost:8080>. Seed demo data into the running stack:

```bash
docker compose exec backend node src/seed/seed.js
```

> The seed script refuses to run when `NODE_ENV=production`. To seed the Docker stack, either run it with `NODE_ENV=development docker compose exec -e NODE_ENV=development backend node src/seed/seed.js`, or point a local backend at the containerised MongoDB.

### Option B — Local development

Requires Node 20+, a running MongoDB, and optionally Redis.

```bash
# Backend
cd backend
cp .env.example .env          # edit MONGO_URI if yours is not on localhost
npm install
npm run seed                  # demo data: 3 approved facilities, 1 pending, history
npm run dev                   # http://localhost:5000/api/v1

# Frontend (second terminal)
cd frontend
cp .env.example .env
npm install
npm run dev                   # http://localhost:5173
```

The Vite dev server proxies `/api` to `localhost:5000`, so there is no CORS setup in development.

**Redis is optional.** Without it the app still runs: caches simply miss, and the distributed lock degrades to a process-local lock (correct for a single instance, logged loudly). `GET /api/v1/health` reports what is actually connected.

**Without a Gemini key**, camera capture at the gate returns a configuration error; manual plate entry still exercises the whole gate flow.

**Without Razorpay keys**, the gateway runs in **mock mode**: orders are created locally and signed with a local secret, so booking → payment → entry → exit works end to end. Mock mode refuses to start when `NODE_ENV=production`.

---

## Demo accounts

After `npm run seed`, password for all: `Parking@123`

| Role | Email |
| --- | --- |
| Platform admin | `admin@parking.dev` |
| Parking owner | `owner1@parking.dev` (MG Road, Indiranagar) |
| Parking owner | `owner2@parking.dev` (Airport, Forum Mall — pending approval) |
| Driver | `driver1@parking.dev` |
| Driver | `driver2@parking.dev` |

Seeded state includes three completed sessions (one with a billed overstay, one inside the grace period), one vehicle currently parked (`KA03XY9911` at MG Road — use it at the **exit** gate), and one facility awaiting admin approval.

### Trying the gate

Sign in as an owner → **Gate Terminal**. Pick the facility and gate, then either capture from the webcam / upload a photo (needs `GEMINI_API_KEY`) or type a plate manually. The panel shows the barrier decision, the matched booking, the session, and at exit the full bill.

---

## How the core flows work

### Booking

```
Select location → view facilities → pick one → enter vehicle details
   → choose duration and entry time → dynamic price quote
   → slot held (reserved++) → Razorpay payment → booking CONFIRMED
```

The slot is held the moment the booking is created, before payment, so a driver is never charged for a slot that vanishes while they are on the payment page. An abandoned checkout releases its hold after 15 minutes. This is **not** booking expiry — a confirmed booking never expires, per spec.

### Entry

```
Camera → image → backend → Gemini Vision → plate
   → already inside? → duplicate, no-op
   → find CONFIRMED booking for (lot, plate, time window)
   → no exact match? score bookings due now and take the closest
   → plate matches → session opened, reserved-- occupied++
```

Refusals are distinguished, because they need different responses at a barrier: no booking here, booked but outside the entry window, plate mismatch (flagged as fraud), or plate unreadable.

### Exit

```
Camera → image → backend → Gemini Vision → plate
   → find open session → parked duration → overstay
   → final bill → slot freed (occupied--) → session closed
   → money owed? payment order created, session PENDING_PAYMENT
```

The barrier opens even when an overstay is unpaid: the vehicle is physically leaving, and holding capacity for a car that is gone would be worse than collecting the balance afterwards. The amount appears in the driver's dues list.

---

## Dynamic pricing

Price is derived from **only** the four factors the specification permits:

```
effectiveRate = baseRate × clamp(occupancy × peakHour × location × dayOfWeek, min, max)
amount        = effectiveRate × billableHours          (any started hour is billed in full)
```

| Factor | Source |
| --- | --- |
| Occupancy | Live occupancy ratio matched against the facility's tiers |
| Peak hours | Configurable windows per weekday; overlapping windows take the highest |
| Location | Zone premium (`standard`, `cbd`, `airport`, `mall`, …) |
| Day of week | One multiplier per weekday |

Two-wheelers and four-wheelers carry separate base rates. The combined multiplier is clamped (default 0.5×–2.5×) so a driver never sees a surprise, and the response reports `cappedFrom` when the clamp bit. The **full price snapshot is stored on the booking** and is never recomputed — later rule changes cannot alter what someone already paid.

Owners tune all of this under **Facility → Dynamic pricing**, with a 24-hour simulation that shows the effect before saving.

---

## Overstay billing

Exactly as specified:

```
overstay = actualExitTime − expectedExitTime
```

The facility's grace period is forgiven; the remainder is billed per started hour at the overstay multiplier applied to the rate the driver actually paid — so a booking-time premium is not compounded twice. Leaving early is recorded but never refunded (the spec has no refund flow). The driver pre-paid the booking, so only the overstay is newly owed.

Worked example — a 2-hour booking at ₹50/h, 45 minutes late, 10-minute grace, 1.5× multiplier:

```
overstay          45 min
chargeable        45 − 10 = 35 min → 1 started hour
overstay rate     ₹50 × 1.5 = ₹75/h
overstay charge   ₹75
total             ₹100 pre-paid + ₹75 = ₹175
amount due        ₹75
```

---

## Concurrency and Redis

The interesting race is two drivers taking the last slot at the same instant. Availability is read and decremented inside a **Redis distributed lock** (`SET NX PX` + token-checked Lua release), keyed on the facility, so the check and the write cannot interleave across processes:

```js
await withLock(lotCapacityLock(lotId), async () => {
  const lot = await ParkingLot.findById(lotId);          // re-read inside the lock
  if (lot.availableFor(vehicleType) <= 0) throw conflict;
  await ParkingLot.updateOne(..., { $inc: { reserved: 1 } });
});
```

The same lock guards the `reserved → occupied` hand-off at entry, and a per-vehicle lock makes exit idempotent so a twice-firing camera cannot double-charge.

Redis also provides availability and search caching (30s/60s TTL), analytics caching (120s), and shared rate-limit counters. All of it degrades gracefully — see `backend/src/config/redis.js`.

---

## Security

| Control | Where |
| --- | --- |
| JWT access + refresh tokens, silent refresh | `modules/auth/token.service.js`, `api/client.js` |
| `tokenVersion` invalidates all tokens on password change or deactivation | `models/User.js`, `middleware/auth.js` |
| Role-based authorization (`user` / `owner` / `admin`) | `middleware/auth.js` |
| Ownership checks — an owner cannot touch another owner's facility | `parking.service.loadManagedLot` |
| bcrypt password hashing | `models/User.js` |
| Zod input validation that **replaces** the request part, so unknown keys never reach a model | `middleware/validate.js` |
| Redis-backed rate limiting, tighter on auth / payments / recognition | `middleware/rateLimit.js` |
| Helmet, explicit CORS allowlist, compression | `app.js` |
| Razorpay signature verified server-side in constant time; payment re-fetched from the gateway to confirm status and amount | `services/razorpay.service.js`, `payment.service.capturePayment` |
| Webhook signature verified over the **raw** body | `app.js`, `payment.controller.webhook` |
| Gemini key server-side only, sent as a header (never a URL, so it stays out of logs) | `services/gemini.service.js` |
| Gate devices authenticate with a device key, not a user token | `middleware/auth.authenticateCamera` |
| Plate mismatches flagged on the booking and in the fraud report | `recognition.service.processEntry` |
| Production refuses to start on default secrets or in payment mock mode | `config/env.js`, `razorpay.service.js` |

Identical failure messages for unknown email and wrong password, so the login endpoint does not leak which accounts exist.

---

## Project layout

```
backend/
  src/
    app.js                  Express wiring, CORS, helmet, raw-body webhook mount
    server.js               Bootstrap, graceful shutdown
    routes.js               Module router table + health check
    config/                 env, MongoDB, Redis
    middleware/             auth, validation, rate limiting, error handling
    models/                 8 Mongoose collections + shared constants
    services/               Gemini, Razorpay, Redis cache, distributed lock
    modules/
      auth/                 register, login, refresh, profile, password
      users/                dashboard aggregate, owner business profile
      parking/              discovery (geo search), owner facility CRUD
      pricing/              the dynamic pricing engine + owner rules
      booking/              reservation with locked capacity
      session/              parking session lifecycle
      billing/              duration, overstay, final bill, receipt
      payment/              transactions, Razorpay orchestration, settlement
      recognition/          gate decision engine (Gemini + verification)
      analytics/            owner, per-facility and platform dashboards
      admin/                users, approvals, commission, monitoring, fraud
    seed/seed.js            demo data
  tests/                    39 unit tests (pricing, billing, plates, locking)

frontend/
  src/
    api/                    axios client with token refresh + endpoint map
    context/AuthContext     session state and role routing
    components/             Layout, ProtectedRoute, UI primitives
    hooks/useCheckout       Razorpay + mock-mode payment driver
    pages/user/             driver panel
    pages/owner/            owner panel incl. gate terminal, pricing editor
    pages/admin/            platform admin panel
  nginx.conf                SPA serving + /api proxy

docker-compose.yml          mongo, redis, backend, frontend(nginx)
docs/API.md                 full endpoint reference
```

---

## Testing

```bash
cd backend && npm test
```

39 tests covering the logic where a mistake costs money or opens a barrier wrongly:

- **pricing** — base arithmetic, per-vehicle-type rates, each of the four factors in isolation, the multiplier clamp, dynamic pricing disabled, overstay quoting and the grace period.
- **billing** — overstay as `actualExit − expectedExit`, grace forgiveness, multi-hour overstay, early exit with no refund, and that only the overstay is newly owed.
- **plates** — normalisation, OCR confusions (O↔0, I↔1), fuzzy matching, and rejecting a genuinely different vehicle.
- **locking** — that concurrent callers are serialised and only one can take the last slot.

The suite runs without MongoDB or Redis (the lock tests deliberately exercise the no-Redis fallback path).

---

## API reference

Base URL `/api/v1`. Full detail in [docs/API.md](docs/API.md).

| Module | Endpoints |
| --- | --- |
| Auth | `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/change-password`; `GET|PATCH /auth/me` |
| Users | `GET /users/dashboard`, `GET|PATCH /users/owner-profile` |
| Parking | `GET /parking/search`, `/parking/:id`, `/parking/:id/availability`, `/parking/mine`, `/parking/:id/manage`; `POST /parking`; `PATCH /parking/:id`; `POST /parking/:id/recount` |
| Pricing | `POST /pricing/quote`; `GET|PUT /pricing/rules/:id`; `POST /pricing/rules/:id/simulate` |
| Bookings | `POST /bookings`; `GET /bookings/mine`, `/bookings/:id`, `/bookings/lot/:id` |
| Sessions | `GET /sessions/mine`, `/sessions/lot/:id`, `/sessions/:id`, `/sessions/:id/preview-bill` |
| Payments | `GET /payments/config`, `/payments/mine`, `/payments/mine/dues`, `/payments/lot/:id`; `POST /payments/booking-order`, `/payments/session-order`, `/payments/verify`, `/payments/failed`, `/payments/webhook` |
| Recognition | `POST /recognition/entry`, `/recognition/exit`, `/recognition/preview`; `GET /recognition/status`, `/recognition/events/:id` |
| Analytics | `GET /analytics/owner`, `/analytics/lot/:id`, `/analytics/platform` |
| Admin | `GET /admin/users`, `/admin/users/:id`, `/admin/lots`, `/admin/transactions`, `/admin/activity`, `/admin/fraud`; `PATCH /admin/users/:id/status`; `POST /admin/lots/:id/review`; `PUT /admin/commission` |

---

## Deliberate design decisions

**Gate refusals return HTTP 200 with `allowed: false`.** A barrier needs a definite answer. "This vehicle has no booking" is a valid outcome, not a failed request, and a 4xx would make gate clients treat it as an error to retry.

**The slot is held before payment, not after.** Holding after payment means a driver can be charged for a slot that was taken while they were on the payment page. The 15-minute reaper on *unpaid* holds is a separate thing from booking expiry, which the spec forbids and which is not implemented.

**Recognition results are audited whether or not the barrier opened.** `vehicleRecognitionEvents` is the record the fraud report and admin monitoring read from; a refusal is often more interesting than a success. Images are never persisted — only what the model returned.

**Plate comparison is fuzzy, in tiers.** OCR reliably confuses O/0 and I/1. An exact or OCR-equivalent match opens the gate; a close match (≥0.85 similarity) opens it and is flagged for review; a plate that merely resembles a booking here (≥0.6) is refused *and* flagged as a mismatch; anything else is simply an unbooked vehicle. Without the candidate scan, the mismatch case would be unreachable — an unrecognised plate would always look like "no booking".

**The commission split is stored on each transaction at capture time.** Changing the platform rate later must not rewrite what an owner already earned.

**`payment.service` knows nothing about bookings or sessions.** Applying a captured payment to domain state lives in `payment.settlement.js`, which keeps the require graph acyclic and every settlement path idempotent — a webhook and a browser callback routinely both arrive for the same payment.

### Not implemented, by specification

Booking cancellation, refunds, booking expiry, and QR codes are all explicitly out of scope. Plate verification replaces the QR code entirely.
