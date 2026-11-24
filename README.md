# ParKar — Smart Parking Management System

ParKar connects parking facilities with drivers. A driver searches for parking near a location, books a spot for a bike, car or bus, and pays online. At the gate, a camera photographs the number plate, the **Gemini Vision API** reads it on the server, and the plate is checked against the booking before the barrier opens. At exit the same read closes the parking session, works out how long the vehicle actually stayed, and bills any overstay automatically.

When a facility is nearly full, ParKar stops admitting requests one at a time. It collects them for a few seconds and runs a **revenue optimiser** that picks the set of bookings that earns the most and still fits physically, then assigns each one a concrete spot.

The backend is a **modular monolith**: one Node.js/Express process with twelve logical modules that talk to each other only through their service layers.

---

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Demo accounts](#demo-accounts)
- [Core flows](#core-flows)
- [Space allocation and the revenue optimiser](#space-allocation-and-the-revenue-optimiser)
- [Dynamic pricing](#dynamic-pricing)
- [Overstay billing](#overstay-billing)
- [Concurrency and Redis](#concurrency-and-redis)
- [Security](#security)
- [Testing and evaluation](#testing-and-evaluation)
- [Deployment](#deployment)
- [Project layout](#project-layout)
- [API reference](#api-reference)
- [Design decisions](#design-decisions)

---

## Features

### Driver
- Register, sign in and manage a profile (with an avatar upload).
- Search facilities near a location on a map, using your current location or a picked point. Sort by distance, price, rating or availability, and filter on EV charging and 24/7 access.
- See a live dynamic price quote before paying, then book a bike, car or bus spot.
- Pay through Razorpay, or with a test coupon in development.
- See your bookings, the spot you were assigned, your parking sessions, your payment history and any overstay you still owe.

### Parking owner
- Register facilities. Each one needs platform approval before drivers can see it.
- Configure fixed bays per vehicle type and a shared flexible area, plus base rates, operating hours, EV charging and amenities.
- Tune the four dynamic-pricing factors and preview the result with a 24-hour price simulation.
- Watch reservations and live sessions on a floor plan of the facility.
- Review the transaction ledger with the commission split, and the gate recognition audit trail.
- Run the entry and exit gate from a browser **Gate Terminal**. It can capture from a webcam, take an uploaded photo, or accept a typed plate.

### Platform admin
- Manage drivers and owners. Approve, reject or deactivate facilities.
- Set the commission per facility.
- Monitor every transaction and live parking activity across the platform.
- Review the fraud report of flagged gate events, such as a plate that doesn't match its booking.

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18, Vite 6, Tailwind CSS 4, React Router 7, React Leaflet (maps), Recharts (charts) |
| Backend | Node.js 20, Express 4, Mongoose 8, Zod, JWT, bcrypt |
| Data | MongoDB 7 (source of truth), Redis 7 (cache, distributed locks, allocation batches, rate limits) |
| Integrations | Gemini Vision (plate recognition), Razorpay (payments), Cloudinary (avatar uploads), OpenStreetMap Nominatim (reverse geocoding) |
| Infra | Docker Compose, Nginx, Render Blueprint |
| Testing | Jest |

---

## Architecture

![Architecture](docs/architecture-bw.png)

```
                        React SPA (Vite)
                              │
                          Nginx :80
                    ┌─────────┴─────────┐
              static assets        /api proxy
                                        │
                            Node.js / Express :5000
                                        │
   Auth · Users · Parking · Geo · Pricing · Booking · Allocation
   Session · Billing · Payment · Recognition · Analytics · Admin
                                        │
                            ┌───────────┴───────────┐
                         MongoDB                  Redis
                                        │
          Gemini Vision · Razorpay · Cloudinary · Nominatim
```

Each module lives in `backend/src/modules/<name>/` with its own routes, controller, service and validation. A module reaches another only through its exported service functions. The boundaries stay real even though everything shares one process and one database.

**Why a monolith?** The domain is small and tightly coupled. A booking, its payment, its session and its bill all belong to one transaction. Splitting them into separate services would bring distributed-transaction problems in exchange for independent deployment that nobody needs yet. If that changes, the module boundaries are where the services would split.

More diagrams are in [docs/](docs/): the main user flow, the allocation flow, the database schema and the space-unit model.

---

## Getting started

### Option A — Docker (the whole stack)

```bash
cp .env.example .env
# Fill in JWT_ACCESS_SECRET, JWT_REFRESH_SECRET and CAMERA_API_KEY.
# Generate a secret with:
#   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

docker compose up --build
```

Open <http://localhost:8080>.

The Docker stack runs with `NODE_ENV=production`, and the seed script refuses to run in production. To load demo data, run the seed with the environment overridden:

```bash
docker compose exec -e NODE_ENV=development backend node src/seed/seed.js
```

### Option B — Local development

You need Node 20 or later and a running MongoDB. Redis is optional.

```bash
# Backend
cd backend
cp .env.example .env          # edit MONGO_URI if MongoDB isn't on localhost
npm install
npm run seed                  # demo users, facilities and history
npm run dev                   # http://localhost:5000/api/v1

# Frontend (in a second terminal)
cd frontend
cp .env.example .env
npm install
npm run dev                   # http://localhost:5173
```

The Vite dev server proxies `/api` to `localhost:5000`, so development needs no CORS setup.

### Running without external services

| Missing | What happens |
| --- | --- |
| Redis | Caches miss, and the lock falls back to a process-local lock. That is correct for a single instance and is logged loudly. Allocation batching is turned off, and every request is admitted first come, first served. |
| `GEMINI_API_KEY` | Camera capture at the gate returns a configuration error. Typing the plate by hand still runs the whole gate flow. |
| Razorpay keys | Payments run in **mock mode**: orders are created and signed locally, so booking → payment → entry → exit works end to end. Mock mode refuses to start in production. |
| Cloudinary keys | Avatar upload is disabled. Everything else works. |

`GET /api/v1/health` reports which dependencies are actually connected.

---

## Configuration

The backend reads `backend/.env` (see [backend/.env.example](backend/.env.example)). Docker Compose reads the root `.env` (see [.env.example](.env.example)).

| Variable | Purpose |
| --- | --- |
| `MONGO_URI`, `REDIS_URL` | Database and Redis connections |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Token signing. **Required in production.** The app refuses to start on the default values. |
| `CAMERA_API_KEY` | Shared secret that gate devices send as the `X-Camera-Key` header |
| `CORS_ORIGINS` | Comma-separated list of origins allowed to call the API |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Plate recognition (default model `gemini-2.5-flash`) |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Payment gateway |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Signed direct-from-browser avatar uploads |
| `PLATFORM_COMMISSION_PERCENT` | Default platform commission (default `10`) |
| `TEST_COUPONS` | Discount codes for testing, e.g. `FREEPARK:100,HALFOFF:50` |
| `ALLOW_TEST_COUPONS` | Set to `true` to allow those coupons in production (meant for staging only) |
| `VITE_API_BASE_URL` (frontend) | API origin. Leave it empty when the frontend and API share an origin. |

---

## Demo accounts

After `npm run seed`, every account uses the password `Parking@123`.

| Role | Email | Notes |
| --- | --- | --- |
| Platform admin | `admin@parking.dev` | |
| Parking owner | `owner1@parking.dev` | Facilities in Bengaluru and Gorakhpur |
| Parking owner | `owner2@parking.dev` | Airport facility, plus Forum Mall awaiting approval |
| Parking owner | `owner3@parking.dev` | No facilities yet; use it to create one |
| Driver | `driver1@parking.dev` | |
| Driver | `driver2@parking.dev` | |

The seed also creates completed sessions (one with a billed overstay, one that ended inside the grace period) and one vehicle that is currently parked: `KA03XY9911` at MG Road. Use that plate at the **exit** gate.

### Trying the gate

Sign in as `owner1` and open **Gate Terminal**. Pick the facility and the gate, then either capture or upload a photo (this needs `GEMINI_API_KEY`) or type a plate. The panel shows the barrier decision, the matched booking, the session and, at exit, the full bill.

---

## Core flows

![Main flow](docs/main-flow.png)

### Booking

```
Choose location → view facilities → pick one → enter vehicle details
   → choose entry time and duration → dynamic price quote
   → allocation (direct, or batched when the lot is nearly full)
   → spot held → Razorpay payment → booking CONFIRMED
```

The spot is held as soon as the booking is created, before payment. That way a driver is never charged for a spot that disappeared while they were on the payment page. A checkout that is abandoned releases its hold after 15 minutes. This is not booking expiry: a confirmed booking never expires.

### Entry

```
Camera → image → backend → Gemini Vision → plate
   → already inside?        → duplicate, nothing to do
   → CONFIRMED booking for (lot, plate, time window)?
   → no exact match         → score bookings due now and take the closest
   → plate matches          → session opened, reserved → occupied
```

Each refusal has its own reason, because the person at the barrier needs to act differently on each: no booking at this facility, a booking outside its entry window, a plate that doesn't match (flagged as fraud), or a plate that couldn't be read.

### Exit

```
Camera → image → backend → Gemini Vision → plate
   → find the open session → time parked → overstay
   → final bill → spot freed → session closed
   → money owed? → payment order created, session PENDING_PAYMENT
```

The barrier opens even when an overstay is unpaid. The vehicle is physically leaving, and holding capacity for a car that has gone would be worse than collecting the balance later. The amount appears in the driver's dues list.

---

## Space allocation and the revenue optimiser

![Allocation flow](docs/allocation-flow.png)

A facility has two kinds of space:

- **Fixed bays** are dedicated to one vehicle type and numbered per type (`BK-01`, `C-01`, `BUS-01`).
- **The flexible area** is one or more rows of bike-sized markers (`A1`, `A2`, …). A bike takes 1 marker, a car 2 and a bus 4. Any vehicle type can park there.

**Fragmentation.** Four free markers scattered along a row can't hold a bus. To prevent that, vehicles are placed only on aligned blocks, like a buddy allocator: a bus starts on a multiple of 4 and a car on a multiple of 2. The free space is then described exactly by three counts (free 4-blocks, 2-blocks and single markers). A set of B buses, C cars and K bikes fits if and only if:

```
B ≤ f4,    C ≤ f2 + 2(f4 − B),    4B + 2C + K ≤ f1 + 2·f2 + 4·f4
```

**Admission.**

- When there is plenty of space, each request is allocated immediately, first come, first served.
- When the facility is nearly full, requests are collected in a Redis batch for a short window (3 seconds by default). One request becomes the batch leader. When the window closes, the leader runs the optimiser over every request collected, choosing the subset with the highest revenue that satisfies the conditions above, and writes a result for each request.

Placement always takes the smallest free block that fits, so it succeeds whenever the optimiser accepts. The optimiser and the placement never disagree. All of this is pure code in [spot.layout.js](backend/src/modules/allocation/spot.layout.js) and is unit-tested directly.

---

## Dynamic pricing

The price depends on four factors only:

```
effectiveRate = baseRate × clamp(occupancy × peakHour × location × dayOfWeek, min, max)
amount        = effectiveRate × billableHours        (any started hour is billed in full)
```

| Factor | Source |
| --- | --- |
| Occupancy | Live occupancy ratio, matched against the facility's tiers |
| Peak hours | Configurable windows per weekday. Where windows overlap, the highest applies. |
| Location | Zone premium (`standard`, `cbd`, `airport`, `mall`, …) |
| Day of week | One multiplier per weekday |

Each vehicle type has its own base rate. The combined multiplier is clamped (0.5× to 2.5× by default) so a driver never sees a surprise price, and the response includes `cappedFrom` when the clamp changed the result. The **full price snapshot is stored on the booking** and is never recomputed, so a later rule change can't alter what someone already paid.

---

## Overstay billing

```
overstay = actualExitTime − expectedExitTime
```

The facility's grace period is forgiven. The rest is billed per started hour, at the overstay multiplier applied to the rate the driver actually paid. That way a booking-time premium isn't counted twice. Leaving early is recorded but never refunded.

Worked example: a 2-hour booking at ₹50/h, 45 minutes late, with a 10-minute grace period and a 1.5× multiplier:

```
overstay          45 min
chargeable        45 − 10 = 35 min → 1 started hour
overstay rate     ₹50 × 1.5 = ₹75/h
total             ₹100 pre-paid + ₹75 = ₹175
amount due        ₹75
```

---

## Concurrency and Redis

The main race to prevent is two drivers taking the last spot at the same moment. Every change to a facility's spot holds happens inside a **Redis distributed lock** keyed on the facility. The lock uses `SET NX PX` to acquire and a token-checked Lua script to release, so the availability check and the write can't interleave across processes. The same lock guards the `reserved → occupied` hand-off at entry. A separate per-vehicle lock makes exit idempotent, so a camera that fires twice can't double-charge.

Redis also holds the allocation batches, availability and search caches (30 and 60 seconds), analytics caches (120 seconds) and shared rate-limit counters. All of it degrades gracefully when Redis is unavailable; see [redis.js](backend/src/config/redis.js).

---

## Security

| Control | Where |
| --- | --- |
| JWT access and refresh tokens with silent refresh | `modules/auth/token.service.js`, `frontend/src/api/client.js` |
| `tokenVersion` invalidates every token on a password change or deactivation | `models/User.js`, `middleware/auth.js` |
| Role-based access (`user`, `owner`, `admin`) and ownership checks on facilities | `middleware/auth.js`, `parking.service` |
| bcrypt password hashing | `models/User.js` |
| Zod validation that replaces the request body, so unknown keys never reach a model | `middleware/validate.js` |
| Redis-backed rate limiting, stricter on auth, payments and recognition | `middleware/rateLimit.js` |
| Helmet, an explicit CORS allowlist, compression | `app.js` |
| Razorpay signatures verified in constant time, and each payment re-fetched from the gateway | `services/razorpay.service.js` |
| Webhook signature verified over the raw request body | `app.js`, `payment.controller.js` |
| Gemini, Razorpay and Cloudinary secrets kept on the server only | `services/` |
| Gate devices authenticate with a device key, not a user token | `middleware/auth.js` |
| Test coupons configured only from the environment, and off in production by default | `services/coupon.service.js` |
| Production refuses to start with default secrets or in payment mock mode | `config/env.js` |

Login returns the same message for an unknown email and a wrong password, so it doesn't reveal which accounts exist.

---

## Testing and evaluation

```bash
cd backend
npm test          # 60 unit tests, no MongoDB or Redis needed
npm run evaluate  # FCFS vs. revenue optimiser simulation
```

The tests cover the logic where a mistake costs money or opens a barrier wrongly:

- **allocation**: space units, aligned placement, the fit conditions, and that the optimiser and placement always agree.
- **pricing**: base arithmetic, per-vehicle rates, each factor on its own, the clamp, and overstay quotes.
- **billing**: overstay as `actualExit − expectedExit`, grace periods, multi-hour overstay, and early exit with no refund.
- **plates**: normalisation, OCR confusions (O↔0, I↔1), fuzzy matching, and rejecting a genuinely different vehicle.
- **locking**: concurrent callers are serialised, so only one gets the last spot.

`npm run evaluate` uses a fixed seed (42) to run 100,000 random allocation scenarios through ParKar's own allocation code. It compares first-come-first-served admission with the optimiser and checks the optimiser against an exhaustive search. Results are written to [paper/results/](paper/results/):

| Metric | Result |
| --- | --- |
| Revenue gain of the optimiser over FCFS | **15.6%** overall |
| Scenarios where FCFS earned less | 49.2% |
| Scenarios where FCFS beat the optimiser | 0 |
| Optimiser matched exhaustive search | 100,000 / 100,000 |
| Accepted requests that couldn't be placed | 0 |

---

## Deployment

**Docker Compose** runs MongoDB, Redis, the backend and an Nginx frontend. Only Nginx is exposed; it serves the SPA and proxies `/api` to the backend.

**Render.** [render.yaml](render.yaml) is a Blueprint that creates the API, the static web app and a Redis instance in one step (Render dashboard → New → Blueprint). MongoDB isn't hosted on Render, so create a MongoDB Atlas cluster and paste its connection string into `MONGO_URI`. After the first deploy, set `CORS_ORIGINS` on the API to the web app's URL, and `VITE_API_BASE_URL` on the web app to the API's URL.

---

## Project layout

```
backend/
  src/
    app.js, server.js, routes.js   Express wiring, bootstrap, module router + health check
    config/                        env, MongoDB, Redis
    middleware/                    auth, validation, rate limiting, error handling
    models/                        Mongoose models + shared constants
    services/                      Gemini, Razorpay, Cloudinary, coupons, cache, lock
    modules/
      auth/  users/  parking/  geo/  pricing/  booking/
      allocation/  session/  billing/  payment/  recognition/
      analytics/  admin/
    seed/                          demo data and data migrations
  scripts/evaluate-allocation.js   allocation evaluation for the paper
  tests/                           Jest unit tests

frontend/
  src/
    api/                           axios client with token refresh, endpoint map
    context/                       auth and theme state
    components/                    layout, maps, floor plan, booking flow, UI primitives
    hooks/useCheckout.js           Razorpay and mock-mode payment
    pages/user/  pages/owner/  pages/admin/
  nginx.conf                       SPA serving + /api proxy

docs/                              API reference and diagrams
paper/                             research paper sources and evaluation results
docker-compose.yml                 mongo, redis, backend, frontend
render.yaml                        Render Blueprint
```

---

## API reference

The base URL is `/api/v1`. Full details are in [docs/API.md](docs/API.md).

| Module | Endpoints |
| --- | --- |
| Health | `GET /health` |
| Auth | `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/change-password`; `GET` / `PATCH /auth/me` |
| Users | `GET /users/dashboard`; `GET` / `PATCH /users/owner-profile` |
| Parking | `GET /parking/search`, `/parking/:id`, `/parking/:id/availability`, `/parking/mine`, `/parking/:id/manage`; `POST /parking`; `PATCH /parking/:id` |
| Geo | `GET /geo/reverse` |
| Pricing | `POST /pricing/quote`; `GET` / `PUT /pricing/rules/:id`; `POST /pricing/rules/:id/simulate` |
| Bookings | `POST /bookings`; `GET /bookings/mine`, `/bookings/:id`, `/bookings/lot/:id` |
| Sessions | `GET /sessions/mine`, `/sessions/lot/:id`, `/sessions/:id`, `/sessions/:id/preview-bill` |
| Payments | `GET /payments/config`, `/payments/mine`, `/payments/mine/dues`; `POST /payments/booking-order`, `/payments/session-order`, `/payments/verify`, `/payments/webhook` |
| Recognition | `POST /recognition/entry`, `/recognition/exit`, `/recognition/preview`; `GET /recognition/status` |
| Analytics | `GET /analytics/owner`, `/analytics/lot/:id`, `/analytics/platform` |
| Admin | `GET /admin/users`, `/admin/lots`, `/admin/transactions`, `/admin/activity`, `/admin/fraud`; `POST /admin/lots/:id/review`; `PUT /admin/commission` |

---

## Design decisions

**Gate refusals return HTTP 200 with `allowed: false`.** A barrier needs a definite answer. "This vehicle has no booking" is a valid outcome, not a failed request, and a 4xx status would make gate clients treat it as an error to retry.

**The spot is held before payment, not after.** Holding it after payment means a driver could be charged for a spot that was taken while they were paying.

**Batching only happens under contention.** When there is plenty of space, the optimiser's answer is the same as first come, first served, so requests are admitted immediately. A request waits a few seconds only when the facility is nearly full and the order of admission actually changes the revenue.

**Every recognition result is audited, whether or not the barrier opened.** The fraud report and admin monitoring read from `vehicleRecognitionEvents`. Images are never stored, only what the model returned.

**Plate comparison is fuzzy, in tiers.** An exact or OCR-equivalent match opens the gate. A close match (similarity of 0.85 or more) opens it and flags it for review. A plate that only resembles a booking here (0.6 or more) is refused and flagged as a mismatch.

**The commission split is stored on each transaction when the payment is captured.** Changing the platform rate later can't rewrite what an owner already earned.

**`payment.service` knows nothing about bookings or sessions.** Applying a captured payment to bookings and sessions happens in `payment.settlement.js`. That keeps the module dependencies free of cycles and makes every settlement path idempotent, which matters because a webhook and a browser callback often both arrive for the same payment.

### Out of scope

Booking cancellation, refunds, booking expiry and QR codes are deliberately not implemented. Plate verification replaces the QR code entirely.
