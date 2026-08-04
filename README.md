# Fitzenix — Gym SaaS Backend API

Production-grade, **multi-tenant SaaS REST API** for a gym-management platform, built on the **MERN** stack (MongoDB + Mongoose, Express, Node.js). It powers a React Native app with four roles: `super_admin`, `gym_owner`, `trainer`, `member`.

---

## Highlights

- **Layered, feature-modular architecture** (`config → middleware → modules(model/service/controller/routes) → utils`).
- **JWT access + refresh tokens** with refresh-token rotation & revocation, bcrypt hashing, OTP, password reset.
- **Multi-tenancy**: every non–super-admin user is scoped to one gym; requests are automatically tenant-filtered.
- **RBAC** on every route.
- **Zod validation** on body/query/params.
- **Razorpay payments** behind a swappable `PaymentGateway` abstraction (+ a deterministic mock for dev/tests), webhook signature verification, invoices.
- **Socket.IO** real-time trainer↔member chat + live notifications.
- **File uploads** via Multer with a swappable storage driver (local ↔ S3-compatible).
- **Swagger/OpenAPI** at `/api/docs`.
- **Consistent response envelope**, central error handler, pagination on all lists, soft-deletes, timestamps.
- **Helmet, CORS, compression, rate limiting, request logging**.
- **Jest + Supertest** tests running against an in-memory MongoDB.
- **Seed script** with demo data across every role.

---

## Key decisions (made autonomously, per the brief)

- **Language: JavaScript ES modules** (not TypeScript). The brief allowed either and prefers TS; given the very large feature surface to implement in one pass, plain ESM maximises working, runnable coverage without a build step. The clean layering makes a later TS migration straightforward.
- **Money: INR paise as integers** everywhere (`*Paise` fields). No floats, no pre-formatted strings — the client formats currency.
- **Email is globally unique** so login-by-email is unambiguous across tenants.
- **Tenancy model**: a `gym` _is_ the tenant. `super_admin` can operate platform-wide or target any gym via `?gymId` / `X-Gym-Id`. Everyone else is locked to `user.gym`.
- **Registration** onboards a `gym_owner` **and** creates their gym (14-day trial). Trainers/members are created inside a gym by the owner.
- **Background jobs** run in-process (membership expiry + reminders). The logic is queue-agnostic so it can be lifted into a Redis/BullMQ worker unchanged.
- **Payments** default to the `mock` gateway; set `PAYMENT_GATEWAY=razorpay` with keys for the real thing.

---

## Getting started

```bash
cp .env.example .env          # then edit secrets
npm install
npm run seed                  # optional: load demo data (needs MongoDB running)
npm run dev                   # start with auto-reload
# API:  http://localhost:4000/api/v1
# Docs: http://localhost:4000/api/docs
```

Requires Node ≥ 18 and a MongoDB instance (`MONGO_URI`).

### Scripts

| Script          | Description                              |
| --------------- | ---------------------------------------- |
| `npm start`     | Run the server                           |
| `npm run dev`   | Run with `--watch`                       |
| `npm run seed`  | Seed demo data                           |
| `npm test`      | Jest + Supertest (in-memory Mongo)       |
| `npm run lint`  | ESLint                                   |

### Seed credentials

| Role         | Email                | Password      |
| ------------ | -------------------- | ------------- |
| super_admin  | admin@fitzenix.com   | `Admin@12345` |
| gym_owner    | owner@ironforge.com  | `Owner@12345` |
| trainer      | anita@ironforge.com  | `Trainer@123` |
| member       | vikram@example.com   | `Member@123`  |

---

## Response conventions

Success:

```json
{ "success": true, "message": "OK", "data": { }, "meta": { "page": 1, "limit": 20, "total": 42, "totalPages": 3 } }
```

Error:

```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "Validation failed", "details": [] } }
```

All list endpoints accept `?page&limit&sort&order&search` plus module-specific filters and return pagination `meta`.

---

## API surface (base path `/api/v1`)

### Auth `/auth`
`POST /register`, `POST /login`, `POST /refresh`, `POST /logout`, `POST /logout-all`,
`GET /me`, `POST /change-password`, `POST /forgot-password`, `POST /reset-password`,
`POST /otp/request`, `POST /otp/verify`

### Users `/users`
`GET /`, `POST /`, `GET /:id`, `PATCH /:id`, `DELETE /:id`,
`PATCH /me`, `POST /me/avatar`

### Gyms `/gyms`
`GET /` (super_admin), `GET /me`, `GET /:id`, `PATCH /:id`,
`PATCH /:id/branding`, `PATCH /:id/settings`, `POST /:id/logo`, `POST /:id/cover`,
`PATCH /:id/status` (super_admin), `DELETE /:id` (super_admin)

### Memberships `/memberships`
Plans: `GET/POST /plans`, `GET/PATCH/DELETE /plans/:id`
Subscriptions: `GET /subscriptions`, `POST /subscriptions`, `GET /subscriptions/me/current`, `POST /subscriptions/:id/cancel`

### Trainers `/trainers`
`GET /`, `GET /me/trainer` (member), `GET /me/members` (trainer),
`GET /:trainerId/members` (owner), `POST /assign` (owner)

### Fitness `/fitness`
Workouts: `GET/POST /workouts`, `GET/PATCH/DELETE /workouts/:id`
Diets: `GET/POST /diets`, `GET/PATCH/DELETE /diets/:id`
Progress: `GET/POST /progress`, `DELETE /progress/:id`

### Attendance `/attendance`
`GET /`, `POST /check-in`, `POST /check-out`

### Payments `/payments`
`POST /webhook` (public, signature-verified), `POST /checkout`, `POST /verify`,
`GET /`, `POST /:id/refund`, `GET /invoices`, `GET /invoices/:id`

### Feed `/feed`
`GET /`, `GET /:id`, `POST /` (with images), `DELETE /:id`,
`POST /:id/like`, `POST /:id/comments`, `DELETE /:id/comments/:commentId`

### Chat `/chat`
`GET/POST /conversations`, `GET /conversations/:id/messages`,
`POST /conversations/:id/messages`, `POST /conversations/:id/read`

### Notifications `/notifications`
`GET /`, `POST /read-all`, `PATCH /:id/read`

### Reports `/reports`
`GET /dashboard` (role-aware), `GET /platform` (super_admin), `GET /gym`, `GET /revenue`

---

## Real-time (Socket.IO)

Connect with the JWT access token:

```js
io("http://localhost:4000", { auth: { token: accessToken } });
```

Events: `chat:join`, `chat:leave`, `chat:send`, `chat:typing`, `chat:read` (client→server);
`chat:message`, `chat:typing`, `chat:read`, `notification:new` (server→client).
Each user auto-joins `user:<id>` and `gym:<gymId>` rooms.

---

## Payments flow

1. `POST /payments/checkout { planId, memberId? }` → creates a **pending** subscription + gateway **order**; returns `order` + `keyId`.
2. Client completes payment in the Razorpay SDK.
3. `POST /payments/verify { orderId, paymentId, signature }` → verifies signature, marks **paid**, **activates** the subscription, issues an **invoice**, notifies the member.
4. `POST /payments/webhook` independently settles `payment.captured` / marks `payment.failed` (idempotent).

---

## Project structure

```
src/
  config/        env, db, logger, constants, swagger
  middleware/    auth, rbac, tenant, validate, rateLimit, upload, errorHandler
  utils/         ApiError, apiResponse, asyncHandler, pagination, tokens, slug
  services/      storage.service, payments/ (PaymentGateway, Razorpay, Mock, factory)
  realtime/      socket.js, emitter.js
  jobs/          scheduler.js
  modules/
    auth/ users/ gyms/ memberships/ trainers/ fitness/
    attendance/ payments/ feed/ chat/ notifications/ reports/
  seed/          seed.js
  app.js  server.js  routes.js
tests/           auth, membership-payment, helpers/
```

Each module follows `model → validators → service → controller → routes`.

---

## Testing

```bash
npm test
```

Uses `mongodb-memory-server` (downloads a Mongo binary on first run) and Supertest to cover auth (register/login/refresh rotation/guards), the full membership→checkout→verify→invoice flow with the mock gateway, tenant isolation, and RBAC.
"# backend" 
