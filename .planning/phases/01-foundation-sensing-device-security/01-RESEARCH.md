# Phase 1: Foundation — Sensing & Device Security - Research

**Researched:** 2026-08-18
**Domain:** IoT device authentication (HMAC + anti-replay), Express 5 API security, TimescaleDB time-series ingestion/retention, RBAC
**Confidence:** MEDIUM-HIGH (package versions VERIFIED against live npm registry this session; architecture/security patterns CITED from official docs and cross-checked web sources; exact SQL/code skeletons are ASSUMED patterns synthesized from those sources — planner should treat code skeletons as a strong starting point, not copy-paste-verified-working SQL)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** New sensor/camera devices are registered via an admin-only API endpoint that generates a `device_id` + HMAC secret; the secret is returned once at registration time and never re-displayed or re-transmittable — the device firmware/config must store it at provisioning time. — **Reversibility:** costly — rotating the scheme later means re-provisioning every physical device in the field.
- **D-02:** A payload that fails signature verification or anti-replay (nonce/timestamp) checking is rejected outright (401, no data written, security event logged) — this is distinct from an authenticated-but-out-of-range reading (SPEC A1/SENS-02), which is still accepted and flagged, not rejected.
- **D-03:** The system supports N sensor devices, each assigned to exactly one greenhouse "zone" (a zone = the unit SPEC's per-zone humidity target, B4/CTRL-06, already operates on). v1 ships with a configurable zone/device model, not a hardcoded single-sensor assumption — this avoids a rework when Phase 3's per-zone humidity targets land.
- **D-04:** No self-service signup for v1 — a single admin account is bootstrapped at deploy time (env-var or first-run setup), and that admin creates operator/viewer accounts via API. Matches the single-greenhouse, small-operator-team scope already set in PROJECT.md.

### Claude's Discretion

- Exact HMAC algorithm/nonce window sizing, and the specific TimescaleDB hypertable/continuous-aggregate configuration, are left to the researcher/planner — STACK.md already gives a strong default (HMAC-SHA256 + timestamp/nonce; TimescaleDB continuous aggregates for the 90-day-raw/2-year-hourly split). **This research resolves that discretion below — see "HMAC Signing Scheme (Exact Design)" and "TimescaleDB Schema (Exact Design)".**

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope. (Severity-tiered alerting, stability/variance alerting, and species-specific thresholds are already tracked as v2 requirements in REQUIREMENTS.md, not phase-1 scope.)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SENS-01 | Ingest temperature/humidity from SHT31-D at 10s interval via authenticated device (signed payload + anti-replay nonce/timestamp) | HMAC Signing Scheme section (exact header names, canonical string, nonce/timestamp window); Express middleware skeleton |
| SENS-02 | Validate each reading against plausible range + rate-of-change limit, flag (not discard) anomalies | Architecture Patterns → Validation Pipeline; `zod` schema + custom rate-of-change validator pattern |
| SENS-03 | Store raw readings (90-day retention) + hourly aggregates (2-year retention) in a queryable time-series store | TimescaleDB Schema (Exact Design) section — hypertable, continuous aggregate, two retention policies |
| SEC-01 | All sensor-ingest and control-command endpoints require auth over TLS | Express/TLS section; helmet + HTTPS enforcement middleware |
| SEC-02 | Actuator control restricted to operator/admin; read-only for others | RBAC middleware section — `requireRole` pattern, roles table |
| SEC-03 | Sensors/cameras authenticate with signed per-device identity + anti-replay (nonce/timestamp) | Same as SENS-01 — device auth is the same mechanism referenced by both requirement IDs |
</phase_requirements>

## Summary

This phase is a backend-only, security-critical foundation: an Express 5 API that (1) authenticates physical sensor devices via per-device HMAC-signed payloads with anti-replay nonce/timestamp checking, (2) validates and stores readings in TimescaleDB with a 90-day-raw / 2-year-hourly-aggregate retention split, and (3) authenticates human operators via session/JWT auth with role-based access control (admin/operator/viewer). All three concerns are well-trodden, standard-library-solvable problems — nothing here requires a custom cryptographic primitive or a hand-rolled time-series partitioning scheme. The npm packages recommended in the project's own `STACK.md` were re-verified against the live npm registry this session (see Package Legitimacy Audit) and are current as of 2026-08-18.

The one design decision this research resolves per CONTEXT.md's "Claude's Discretion" note is the **exact** HMAC canonical-string format, nonce/timestamp window, and the **exact** TimescaleDB DDL shape for the retention split — both are specified concretely below so the planner can turn them directly into tasks without further design work.

**Primary recommendation:** Build device auth as Express middleware verifying `HMAC-SHA256(secret, method + path + timestamp + nonce + rawBody)` against an `X-Signature` header, with a ±30s timestamp window and a per-device in-DB nonce/sequence check (D-02's "reject outright, log, no write" behavior); build storage as one TimescaleDB hypertable (`sensor_readings`) + one continuous aggregate (`sensor_readings_hourly`) + two `add_retention_policy()` calls (90 days on the hypertable, 2 years on the aggregate); build human RBAC as JWT (`jose`) + a `requireRole(['admin','operator'])` middleware factory, with device auth and user auth living on structurally separate route trees (devices never get a JWT; humans never get a device HMAC secret).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Device (sensor/camera) identity & HMAC signature verification | API / Backend | — | Must happen server-side before any data is trusted; devices are unauthenticated clients from the server's perspective until verified |
| Anti-replay (nonce/timestamp) enforcement | API / Backend | Database / Storage | Verification logic lives in Express middleware; the nonce/sequence *state* (last-seen value per device) must be durably stored (DB), not in-process memory, or a server restart silently reopens the replay window |
| Sensor payload range/rate-of-change validation | API / Backend | — | Business rule (SPEC A1/B1 thresholds) — belongs in the ingest request pipeline before persistence, not in the DB layer or the device firmware |
| Time-series storage (raw + hourly aggregate, retention) | Database / Storage | — | TimescaleDB hypertable + continuous aggregate + retention policy — this is a storage-engine-native feature, not application code |
| User authentication (admin/operator/viewer login) | API / Backend | — | Session/JWT issuance and verification is a backend concern; never trust a client-supplied role claim without server-side verification |
| RBAC enforcement on actuator-control endpoints | API / Backend | — | Must be enforced server-side per request; a UI-only "hide the button" is not a security control |
| Device registry (device_id ↔ secret ↔ zone) | Database / Storage | API / Backend | Relational table, admin-only CRUD via API; the zone/device model (D-03) is exactly the kind of relational join Postgres/TimescaleDB handles natively alongside the time-series hypertable |
| TLS termination | Reverse proxy / Load balancer (or Express itself in dev) | API / Backend | In production, TLS is normally terminated at a reverse proxy (nginx/Caddy) or platform load balancer in front of Express; Express enforces "TLS-only" by rejecting non-HTTPS traffic (via `X-Forwarded-Proto` check) rather than terminating TLS itself. This phase must document which mode applies to the deployment target. |

## Standard Stack

### Core

| Library | Version (verified 2026-08-18) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `express` | 5.2.1 `[VERIFIED: npm registry — npm view express version]` | HTTP API framework | Already project-mandated (STACK.md, PROJECT.md constraints); v5's built-in async error handling matters for a process that must never crash on an unhandled promise rejection in an ingest/auth route. |
| `pg` | 8.23.0 `[VERIFIED: npm registry]` | PostgreSQL/TimescaleDB driver | Raw driver, not an ORM — needed for hypertable-specific SQL (`time_bucket`, `add_retention_policy`) that ORMs fight against. |
| `zod` | 4.4.3 `[VERIFIED: npm registry]` | Runtime input validation | Validates every sensor payload shape and every admin-facing request body at the API boundary — directly satisfies SEC input-validation posture and SENS-02's range/type checks before the custom rate-of-change check runs. |
| `jose` | 6.2.9 `[VERIFIED: npm registry]` | JWT issuance/verification for human user sessions | ESM-first, actively maintained, spec-compliant; used only for human operator/admin/viewer auth — never for device auth (devices use HMAC, not JWT, per D-01). |
| `helmet` | 8.3.0 `[VERIFIED: npm registry]` | Security headers (HSTS, no-sniff, etc.) | Baseline hardening applied globally; directly supports SEC-01's "TLS enforced" posture (HSTS header) alongside the explicit HTTPS-redirect/reject middleware. |
| `bcrypt` | 6.0.0 `[VERIFIED: npm registry]` | Password hashing for admin/operator/viewer accounts | See "Password Hashing" pitfall note below — `argon2` is OWASP's 2024+ first choice, but `bcrypt` is flagged here as the safer *default pick for this phase* due to native-binary distribution risk; see Package Legitimacy Audit for the tradeoff. |

### Supporting

| Library | Version (verified 2026-08-18) | Purpose | When to Use |
|---------|---------|---------|-------------|
| `express-rate-limit` | 8.6.2 `[VERIFIED: npm registry]` | Rate limiting | Apply per-device (keyed by `device_id`, not IP) on ingest routes as defense-in-depth alongside the anti-replay check — a valid-but-flooding device should still be throttled. |
| `drizzle-orm` | 0.45.2 `[VERIFIED: npm registry]` | Lightweight query builder over `pg` | Optional — use only if the team wants typed queries for the *relational* tables (users, devices, zones); keep raw SQL via `pg` for all TimescaleDB-specific statements (hypertable creation, continuous aggregates, retention policies) since Drizzle has no first-class support for those. |
| `pino` | 10.3.1 `[VERIFIED: npm registry]` | Structured logging | Use for the security-event log required by D-02 ("failed verification... logged") — structured JSON logs make it possible to alert on repeated auth failures per device later. |
| `dotenv` or platform env injection | n/a | Secrets (device HMAC secrets encryption key, JWT signing key, admin bootstrap credential) | Never hardcode; SPEC.md's secrets-management rule applies to device secrets and JWT keys exactly as it does to the LLM API key. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `bcrypt` | `argon2` | OWASP's current first-choice (memory-hard, better GPU/ASIC resistance) `[CITED: OWASP password storage guidance via cross-checked web search]`. Tradeoff: `argon2` npm package ships a native addon requiring node-gyp/prebuilt binaries per platform — more deployment friction in constrained/on-prem greenhouse server environments than pure-JS-adjacent `bcrypt`. Recommend `argon2` if the deployment target is a standard Linux server/container with reliable prebuilt-binary support; fall back to `bcrypt` (cost factor ≥12) if the deployment target is uncertain or resource-constrained. This is a discretionary call the planner should make explicit as a task-level decision, not leave implicit. |
| `jose` (JWT) | Server-side session store (Redis/DB-backed session, `express-session`) | JWT is stateless (no session-store dependency) but harder to revoke instantly (e.g., admin deactivates an operator mid-session). For a small-operator-team, single-greenhouse deployment (PROJECT.md scope), a short-lived JWT (e.g., 1hr) + refresh pattern is simpler than standing up a session store; revisit if instant revocation becomes a hard requirement. |
| HMAC-signed payload | mTLS (per-device client certs) | STACK.md already made this call for the project — mTLS's PKI/cert-rotation overhead isn't justified for single-greenhouse scope. Not revisited here. |

**Installation:**
```bash
npm install express@5.2.1 pg@8.23.0 zod@4.4.3 jose@6.2.9 helmet@8.3.0 bcrypt@6.0.0 express-rate-limit@8.6.2 pino@10.3.1
npm install -D typescript @types/node @types/express vitest supertest
```

**Version verification:** All Core and Supporting package versions above were confirmed live against the npm registry on 2026-08-18 via `npm view <package> version`. Re-run this check immediately before `npm install` in execution, since these ecosystems move fast.

## Package Legitimacy Audit

| Package | Registry | Age (last publish) | Downloads/wk | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `express` | npm | 2025-12-01 | 109.9M | github.com/expressjs/express | OK | Approved |
| `pg` | npm | 2026-08-08 | 39.2M | github.com/brianc/node-postgres | SUS (`"too-new"` heuristic) | Approved — false-positive: 39M weekly downloads + canonical official repo; "too-new" reflects a routine version bump on an actively maintained package, not package age. No action required. |
| `zod` | npm | 2026-05-04 | 224.1M | github.com/colinhacks/zod | OK | Approved |
| `jose` | npm | 2026-08-15 | 80.1M | github.com/panva/jose | SUS (`"too-new"` heuristic) | Approved — same false-positive pattern as `pg`; 80M weekly downloads, official `panva/jose` repo. No action required. |
| `helmet` | npm | 2026-07-12 | 10.2M | github.com/helmetjs/helmet | OK | Approved |
| `express-rate-limit` | npm | 2026-08-04 | 39.6M | github.com/express-rate-limit/express-rate-limit | SUS (`"too-new"` heuristic) | Approved — same false-positive pattern; 39.6M weekly downloads. No action required. |
| `drizzle-orm` | npm | 2026-03-27 | 13.6M | github.com/drizzle-team/drizzle-orm | OK | Approved (optional dependency) |
| `bcrypt` | npm | 2025-05-11 | 4.9M | github.com/kelektiv/node.bcrypt.js | OK | Approved |
| `argon2` | npm | 2026-07-21 | 1.7M | github.com/ranisalt/node-argon2 | SUS (`"too-new"` heuristic) | Approved if selected as the bcrypt alternative — 1.7M weekly downloads, official repo; "too-new" is the same recency false-positive. Flag for `checkpoint:human-verify` only because it's the *discretionary alternative*, not the default pick — verify native-binary build compatibility on the target deployment platform before committing. |
| `pino` | npm | 2026-02-09 | 37.5M | github.com/pinojs/pino | OK | Approved |
| `opossum` | npm | 2026-06-24 | 1.2M | github.com/nodeshift/opossum | OK | Approved (listed for completeness — not used until Phase 3/4's circuit-breaker needs; no action this phase) |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** `pg`, `jose`, `express-rate-limit`, `argon2` — all four are heuristic false-positives driven by a recent-publish-date signal on extremely high-download, canonically-sourced packages (39M-224M weekly downloads each, official GitHub org repos). No `checkpoint:human-verify` is warranted for `pg`/`jose`/`express-rate-limit` (they are the STACK.md-mandated default picks and the download/repo evidence is conclusive). `argon2` gets a `checkpoint:human-verify` only because it is the *optional* alternative to `bcrypt` — the planner should insert that checkpoint if `argon2` is chosen over `bcrypt`.

*Package names above were originally surfaced in the project's `STACK.md` (itself sourced from web search/training knowledge), so per the package-name-provenance rule, treat every package name as `[ASSUMED]` provenance even though registry existence, download counts, and repo identity are `[VERIFIED: npm registry]` this session — the *name itself* did not come from official docs or Context7.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│  DEVICE LAYER (untrusted until verified)                            │
│  ESP32 + SHT31-D  ──HTTPS POST──▶  /api/v1/ingest/readings          │
│  (device_id, HMAC secret burned in at provisioning per D-01)        │
└───────────────────────────────┬───────────────────────────────────────┘
                                 │ headers: X-Device-Id, X-Timestamp,
                                 │          X-Nonce, X-Signature
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  EXPRESS API (single deployable process)                            │
│                                                                       │
│  [TLS-enforcement middleware] → reject plain HTTP (SEC-01)          │
│         │                                                            │
│         ▼                                                            │
│  [helmet security headers]                                          │
│         │                                                            │
│         ▼                                                            │
│  ┌── Device-auth route tree ──────────┐  ┌── Human-auth route tree ─┐│
│  │ /api/v1/ingest/*                    │  │ /api/v1/auth/login       ││
│  │ /api/v1/devices/register (admin-only│  │ /api/v1/users/*          ││
│  │  via human-auth tree, see below)    │  │ /api/v1/zones/*          ││
│  │                                      │  │ /api/v1/readings/* (read)││
│  │ [deviceHmacAuth middleware]          │  │ [jwtAuth middleware]     ││
│  │  1. look up device_id → secret       │  │ [requireRole(...)]       ││
│  │  2. recompute HMAC over canonical    │  └──────────┬───────────────┘│
│  │     string, timingSafeEqual compare  │             │                │
│  │  3. check |now - timestamp| ≤ 30s    │             │                │
│  │  4. check nonce not seen for device  │             │                │
│  │     (D-02: fail → 401, log, no write)│             │                │
│  │         │ pass                        │             │                │
│  │         ▼                             │             │                │
│  │  [zod schema validation]              │             │                │
│  │         │ pass (shape/type only)      │             │                │
│  │         ▼                             │             │                │
│  │  [range + rate-of-change validator]   │             │                │
│  │   -10..60°C / 0..100%RH + Δ limit     │             │                │
│  │   (SENS-02: flag but ALWAYS persist) │             │                │
│  │         │                             │             │                │
│  │         ▼                             │             │                │
│  │  INSERT INTO sensor_readings          │◀────────────┘ (reads join    │
│  │  (status = 'valid' | 'flagged')       │                zones/devices)│
│  └────────────────────────────────────────┘                             │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  TimescaleDB (Postgres + extension)                                  │
│  sensor_readings (hypertable, raw, 90d retention)                    │
│    └─▶ sensor_readings_hourly (continuous aggregate, 2y retention)   │
│  devices / zones / users (plain relational tables, joined by ingest  │
│    auth lookup and by RBAC/zone-scoped queries)                      │
│  device_nonces (durable anti-replay state — see Common Pitfalls)     │
└─────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
backend/
├── src/
│   ├── ingest/
│   │   ├── deviceAuth.ts        # HMAC verify + nonce/timestamp middleware
│   │   ├── validators.ts        # zod schema + range/rate-of-change checks
│   │   └── ingestController.ts  # POST /api/v1/ingest/readings
│   ├── auth/
│   │   ├── userAuth.ts          # login, JWT issue/verify (jose)
│   │   ├── requireRole.ts       # RBAC middleware factory
│   │   └── bootstrapAdmin.ts    # first-run admin creation from env vars (D-04)
│   ├── devices/
│   │   ├── deviceRegistry.ts    # admin-only device_id + secret generation (D-01)
│   │   └── deviceRoutes.ts
│   ├── zones/
│   │   └── zoneRoutes.ts        # zone CRUD (D-03)
│   ├── readings/
│   │   └── readingsQuery.ts     # raw (≤90d) + hourly (≤2y) read endpoints
│   ├── db/
│   │   ├── pool.ts              # pg Pool
│   │   ├── migrations/          # SQL migration files (hypertable, cagg, retention)
│   │   └── repositories/
│   ├── middleware/
│   │   ├── tlsEnforce.ts        # reject non-HTTPS (SEC-01)
│   │   └── errorHandler.ts
│   └── config/
│       └── thresholds.ts        # -10/60°C, 0/100%RH, 5°C/10s, 30s auth window — externalized
├── tests/
└── package.json
```

### Structure Rationale
- **`ingest/` vs `auth/` separation:** Device authentication (HMAC) and human authentication (JWT) are structurally different middleware with different failure semantics (D-02's "401 + log + no write" vs. a normal 401/403 for human RBAC) — keeping them in separate modules prevents a future maintainer from accidentally applying JWT middleware to a device route or vice versa.
- **`device_nonces` as its own repository/table, not in-process memory:** A Node process restart must not silently reopen the replay window (see Common Pitfalls, Pitfall 2).
- **`config/thresholds.ts`:** SPEC.md's own note says these are placeholder values pending expert review — externalizing avoids a code change when domain experts tune the -10/60°C, 0/100%RH, or 5°C/10s numbers.

### Pattern 1: HMAC Device Authentication Middleware (Exact Design)

**What:** Every ingest request from a device must carry four headers: `X-Device-Id`, `X-Timestamp` (Unix ms), `X-Nonce` (random string, unique per device), `X-Signature` (hex HMAC-SHA256). The server recomputes the HMAC over a canonical string and compares in constant time.

**Canonical string to sign** (device firmware and server must construct identically):
```
canonicalString = `${method}\n${path}\n${timestamp}\n${nonce}\n${rawBody}`
```
Signed as: `signature = HMAC_SHA256(deviceSecret, canonicalString).toString('hex')`

**Anti-replay window:** Reject if `Math.abs(Date.now() - timestamp) > 30_000` (30s window) `[CITED: general HMAC/webhook anti-replay guidance — timestamp windows of a few minutes are common; 30s is tightened here to match STACK.md's existing recommendation and this project's 10s ingest cadence — a legitimate device should never be more than one or two intervals late]`. Nonce is checked against a durable `device_nonces` table (see TimescaleDB Schema section) — reject if `(device_id, nonce)` already seen, or simpler: store `last_seen_timestamp` per device and reject any timestamp ≤ last-accepted timestamp (monotonic-timestamp-as-nonce), which avoids needing to store every nonce ever seen. **Recommendation: use the monotonic-timestamp approach** (store one `last_accepted_ts` column per device, reject non-increasing timestamps) — it's simpler than a nonce table, requires O(1) storage per device instead of unbounded nonce history, and satisfies D-01/D-02/SEC-03's anti-replay requirement identically. Firmware must guarantee strictly-increasing timestamps per device (a real-time clock or monotonic counter), which is a reasonable ESP32 firmware requirement.

**Example (Node.js, Express 5, `crypto` built-in — no extra package):**
```typescript
// src/ingest/deviceAuth.ts
import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";

const TIMESTAMP_WINDOW_MS = 30_000;

export async function deviceHmacAuth(req: Request, res: Response, next: NextFunction) {
  const deviceId = req.header("X-Device-Id");
  const timestampHeader = req.header("X-Timestamp");
  const nonce = req.header("X-Nonce");
  const signature = req.header("X-Signature");

  if (!deviceId || !timestampHeader || !nonce || !signature) {
    logSecurityEvent("auth_missing_headers", { deviceId });
    return res.status(401).json({ error: "missing_auth_headers" });
  }

  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > TIMESTAMP_WINDOW_MS) {
    logSecurityEvent("auth_timestamp_out_of_window", { deviceId, timestamp });
    return res.status(401).json({ error: "timestamp_out_of_window" }); // D-02: reject, no write
  }

  const device = await deviceRepository.findById(deviceId); // { secret, lastAcceptedTs, zoneId }
  if (!device) {
    logSecurityEvent("auth_unknown_device", { deviceId });
    return res.status(401).json({ error: "unknown_device" });
  }

  if (timestamp <= device.lastAcceptedTs) {
    logSecurityEvent("auth_replay_rejected", { deviceId, timestamp });
    return res.status(401).json({ error: "replay_rejected" }); // D-02: reject, no write
  }

  const rawBody = (req as any).rawBody as string; // captured by a raw-body-preserving body parser
  const canonicalString = `${req.method}\n${req.path}\n${timestamp}\n${nonce}\n${rawBody}`;
  const expected = crypto.createHmac("sha256", device.secret).update(canonicalString).digest();
  const provided = Buffer.from(signature, "hex");

  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    logSecurityEvent("auth_signature_invalid", { deviceId });
    return res.status(401).json({ error: "invalid_signature" }); // D-02: reject, no write
  }

  await deviceRepository.updateLastAcceptedTs(deviceId, timestamp); // advance monotonic marker
  (req as any).device = device;
  next();
}
```
`[ASSUMED — synthesized pattern: the canonical-string format, header names, and monotonic-timestamp-as-nonce simplification are this session's design choices, informed by CITED general HMAC-signing guidance, not copied from a single authoritative source. Verify header-name choices don't collide with any existing firmware convention before locking in.]`

**Why `timingSafeEqual`, not `===`:** String/Buffer equality comparison via `===` short-circuits on the first mismatched byte, leaking timing information an attacker can use to guess the signature byte-by-byte; `crypto.timingSafeEqual` compares in constant time regardless of where the buffers differ `[CITED: Node.js crypto module guidance, cross-checked web search]`. Both buffers must be the same length or `timingSafeEqual` throws — check `.length` equality first (as in the example above) to avoid an uncaught exception on a malformed signature.

### Pattern 2: RBAC Middleware for Human Users

**What:** A `requireRole(allowedRoles: string[])` middleware factory chained after JWT verification. Roles: `admin`, `operator`, `viewer` (per D-04 — admin bootstraps operator/viewer accounts).

**When to use:** Any route where SEC-02 applies — actuator-control endpoints require `admin` or `operator`; read-only endpoints (dashboard data, historical readings) are accessible to any authenticated role including `viewer`.

**Example:**
```typescript
// src/auth/requireRole.ts
import type { Request, Response, NextFunction } from "express";

export function requireRole(allowedRoles: Array<"admin" | "operator" | "viewer">) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user; // set by prior jwtAuth middleware
    if (!user || !allowedRoles.includes(user.role)) {
      return res.status(403).json({ error: "insufficient_role" });
    }
    next();
  };
}

// Usage:
// router.post("/actuators/:id/command", jwtAuth, requireRole(["admin", "operator"]), commandController);
// router.get("/readings", jwtAuth, requireRole(["admin", "operator", "viewer"]), readingsController);
```
`[CITED: Express RBAC middleware pattern — requireRole/authorizeRoles factory checking role array membership, cross-checked across multiple web sources]`

**Note on Phase 1 scope:** This phase has no actuator-control endpoints yet (that's Phase 3) — SEC-02's RBAC requirement in Phase 1 applies to whatever admin-only endpoints exist now (device registration, user management) and establishes the `requireRole` pattern Phase 3 will reuse verbatim for actuator routes.

### Anti-Patterns to Avoid
- **Device authentication without freshness checking:** A static shared API key or unsigned device ID header blocks casual access but does not stop replay — this is Pitfall 4 from the project's own `PITFALLS.md` and is explicitly why D-02 requires nonce/timestamp checking, not just signature validity.
- **In-memory nonce/timestamp tracking:** Storing `lastAcceptedTs` only in a JS `Map` in process memory means a server restart resets every device's replay window to zero — must be persisted in the `devices` table (or a dedicated `device_nonces` table).
- **Applying rate-limiting only as a UX nicety:** `express-rate-limit` should be treated as a hard security control (defense-in-depth alongside anti-replay), not merely a courtesy throttle — per the project's own `PITFALLS.md` Security Mistakes table.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Time-series partitioning + downsampling + expiry for 90-day raw / 2-year hourly data | Custom cron jobs that `DELETE FROM ... WHERE timestamp < now() - interval` and manually compute hourly averages into a second table | TimescaleDB hypertable + continuous aggregate + `add_retention_policy()` (both on the hypertable and the aggregate) | Native chunk-exclusion, automatic incremental refresh, and background retention jobs are exactly what TimescaleDB is built for; hand-rolled cron-based equivalents are a well-documented source of "why is this query slow after 3 months" bugs `[CITED: STACK.md's own "What NOT to Use" table, itself cross-checked against Timescale docs]`. |
| Constant-time signature comparison | A hand-rolled loop comparing bytes with early-exit | `crypto.timingSafeEqual` (Node built-in) | Hand-rolled comparison loops almost always short-circuit on first mismatch, reintroducing the exact timing side-channel the constant-time primitive exists to close. |
| Password hashing | A custom PBKDF2/salt scheme | `bcrypt` (cost ≥12) or `argon2id` | Both are audited, OWASP-endorsed, and handle salt generation/storage automatically — a hand-rolled scheme is a near-guaranteed source of a future security incident. |
| JWT signing/verification | Manual base64+HMAC JWT construction | `jose` | Correct implementation of JWT's `alg`-confusion resistance, expiry checks, and clock-skew tolerance is easy to get subtly wrong by hand. |

**Key insight:** Every "don't hand-roll" item above has a mature, actively-maintained, single-purpose library — this phase's entire risk surface is in *composing* these correctly (canonical string construction, retention policy DDL, RBAC middleware ordering), not in inventing new cryptography or storage engines.

## TimescaleDB Schema (Exact Design)

**Retention requirement (SPEC A3/B3, SENS-03):** raw readings queryable 90 days back; hourly aggregates queryable 2 years back.

```sql
-- Extension (once per database)
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Relational tables (plain Postgres, joined against the hypertable)
CREATE TABLE zones (
  zone_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE devices (
  device_id        TEXT PRIMARY KEY,           -- burned-in ID from provisioning (D-01)
  secret_hash      TEXT NOT NULL,               -- HMAC secret, stored hashed/encrypted at rest
  zone_id          UUID NOT NULL REFERENCES zones(zone_id),
  sensor_type      TEXT NOT NULL,               -- e.g. 'SHT31-D'
  calibrated_at    TIMESTAMPTZ,                 -- Pitfall 1 (PITFALLS.md): capture calibration metadata now
  last_accepted_ts BIGINT NOT NULL DEFAULT 0,   -- monotonic anti-replay marker (ms epoch)
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at       TIMESTAMPTZ                  -- revocation path per PITFALLS.md Integration Gotchas
);

CREATE TABLE users (
  user_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'operator', 'viewer')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Time-series hypertable (raw readings, 10s cadence)
CREATE TABLE sensor_readings (
  "time"       TIMESTAMPTZ NOT NULL,
  device_id    TEXT NOT NULL REFERENCES devices(device_id),
  zone_id      UUID NOT NULL REFERENCES zones(zone_id),
  metric       TEXT NOT NULL,          -- 'temperature' | 'humidity'
  value        DOUBLE PRECISION NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('valid', 'flagged', 'interpolated')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

SELECT create_hypertable('sensor_readings', by_range('time'));

-- Continuous aggregate: hourly average per device/zone/metric
CREATE MATERIALIZED VIEW sensor_readings_hourly
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', "time") AS bucket,
  device_id,
  zone_id,
  metric,
  avg(value)   AS avg_value,
  min(value)   AS min_value,
  max(value)   AS max_value,
  count(*)     AS sample_count,
  count(*) FILTER (WHERE status = 'flagged') AS flagged_count
FROM sensor_readings
GROUP BY bucket, device_id, zone_id, metric;

-- Keep the aggregate refreshed
SELECT add_continuous_aggregate_policy('sensor_readings_hourly',
  start_offset      => INTERVAL '3 hours',
  end_offset        => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour');

-- Retention: drop raw chunks older than 90 days
SELECT add_retention_policy('sensor_readings', drop_after => INTERVAL '90 days');

-- Retention: drop aggregated data older than 2 years
SELECT add_retention_policy('sensor_readings_hourly', drop_after => INTERVAL '2 years');
```

`[CITED: TimescaleDB continuous-aggregate + retention-policy pattern — CREATE MATERIALIZED VIEW ... WITH (timescaledb.continuous), add_continuous_aggregate_policy, add_retention_policy — cross-checked across Timescale's own docs mirror and multiple 2026 tutorials returned by web search]`. The exact column names, table names, and the `device_nonces`-avoidance via `last_accepted_ts` column are `[ASSUMED]` — this session's synthesis to fit this project's specific schema needs (D-03's zone model, D-01's device registry), not copied verbatim from a single source. **Before locking this into a migration file, run it against a real TimescaleDB instance** — continuous aggregate syntax has changed across TimescaleDB major versions and this should be smoke-tested against the exact pinned version (TimescaleDB 2.23+, per STACK.md).

**Design note — one row per metric vs. wide table:** The schema above uses a narrow/long format (`metric` + `value` columns, one row per temperature-or-humidity reading) rather than a wide table (`temperature FLOAT, humidity FLOAT` in one row). This is a deliberate choice: SHT31-D reports both values together, but the narrow format generalizes cleanly if a future sensor type reports a different metric set, and it keeps the `status` (valid/flagged) flag per-metric rather than forcing one flag to cover two independently-anomalous values. The planner may choose the wide format instead if it simplifies Phase 2/3 queries — flag this as an open decision for the plan to make explicit, not silently default one way.

## Common Pitfalls

### Pitfall 1: Conflating "device authentication" with "anti-replay" (already covered above, restated as a checklist item)
**What goes wrong:** A static shared key or unsigned device-ID header passes as "authentication" but a captured-and-resent valid payload sails through unchanged.
**Why it happens:** These are two different security properties that look similar in a design doc but require different mechanisms (signature verification vs. freshness/uniqueness tracking).
**How to avoid:** Implement both halves explicitly — signature check AND `last_accepted_ts` monotonic check — and write a test that captures one valid request and replays it, asserting a 401.
**Warning signs:** No test exists that specifically replays a previously-valid payload and expects rejection.

### Pitfall 2: In-memory anti-replay state
**What goes wrong:** Storing the "last seen timestamp/nonce per device" only in a process-local `Map` means every deploy/restart/crash silently resets every device's replay window to zero, reopening a window for previously-captured payloads to be replayed undetected.
**Why it happens:** In-memory state is the easiest thing to reach for first ("just cache it") and works fine in local dev/testing where the process never restarts mid-test.
**How to avoid:** Persist `last_accepted_ts` in the `devices` table (as in the schema above) and update it transactionally with the read — or accept the small risk window and document it if truly ephemeral tracking is chosen, but that should be an explicit, reviewed tradeoff, not a default.
**Warning signs:** No DB write happens as part of the auth-success path, only as part of the data-insert path.

### Pitfall 3: Sensor drift mistaken for "no anomalies" (from project PITFALLS.md, Pitfall 1)
**What goes wrong:** Rate-of-change and range checks (SENS-02) catch sudden noise but not slow drift — a sensor reading 3% RH low after months of use never trips a rate-of-change or range flag.
**Why it happens:** Drift is low-frequency/gradual and invisible to instant-comparison validation rules by construction.
**How to avoid:** This phase should, at minimum, capture `calibrated_at` as metadata on the `devices` table (already in the schema above) even though full drift-detection logic is out of this phase's scope — this avoids a costly backfill later when a drift-detection phase is eventually built. `[CITED: project PITFALLS.md Pitfall 1 — explicitly flagged as "capture calibration metadata now even if drift-alerting logic lands later"]`
**Warning signs:** No `calibrated_at`/`sensor_id` metadata column exists on the device/reading schema.

### Pitfall 4: Rate limiting applied only at the API-gateway layer, assumed sufficient on its own
**What goes wrong:** `express-rate-limit` throttles by default key (usually IP); if keyed incorrectly (by IP instead of `device_id`), multiple devices behind the same NAT/gateway either get incorrectly throttled together or a single misbehaving device isn't isolated.
**Why it happens:** Default rate-limit configuration usually keys by IP out of the box; greenhouse deployments often have all devices behind one local network/NAT.
**How to avoid:** Explicitly configure `express-rate-limit`'s `keyGenerator` to use `req.header('X-Device-Id')` (post-auth) rather than the default IP-based key.
**Warning signs:** Rate-limit config uses the library's default key generator without a custom override.

### Pitfall 5: TLS-enforcement middleware trusting `X-Forwarded-Proto` without validating it comes from a trusted proxy
**What goes wrong:** If Express is deployed behind a reverse proxy (nginx/Caddy/load balancer) that terminates TLS, the app must check `req.header('x-forwarded-proto') === 'https'` to enforce SEC-01 — but if `trust proxy` isn't configured correctly, that header can be spoofed by a client claiming HTTPS on a plaintext connection.
**Why it happens:** Express's `app.set('trust proxy', ...)` is easy to skip or misconfigure, especially in early development when everything runs on `localhost` without a real proxy.
**How to avoid:** Set `app.set('trust proxy', 1)` (or the specific proxy count/IP range for the deployment) and only trust `X-Forwarded-Proto` when the request's immediate peer is the known reverse proxy; document explicitly whether Express terminates TLS directly (via `https.createServer`) or relies on a fronting proxy in this deployment.
**Warning signs:** No explicit `trust proxy` configuration, or TLS-enforcement middleware exists only as a comment/TODO.

## Code Examples

### Sensor payload validation (zod schema + rate-of-change check)
```typescript
// src/ingest/validators.ts
import { z } from "zod";

export const sensorReadingSchema = z.object({
  temperature: z.number().optional(),
  humidity: z.number().optional(),
}).refine(d => d.temperature !== undefined || d.humidity !== undefined, {
  message: "at least one of temperature/humidity required",
});

const RANGE = {
  temperature: { min: -10, max: 60, maxDeltaPer10s: 5 },
  humidity:    { min: 0,   max: 100, maxDeltaPer10s: 15 }, // RH% rate-of-change not specified in SPEC.md — flagged below
};

export function classifyReading(metric: "temperature" | "humidity", value: number, previous?: { value: number; atMs: number }, nowMs?: number): "valid" | "flagged" {
  const r = RANGE[metric];
  if (value < r.min || value > r.max) return "flagged";
  if (previous && nowMs) {
    const elapsedSec = (nowMs - previous.atMs) / 1000;
    const allowedDelta = r.maxDeltaPer10s * (elapsedSec / 10);
    if (Math.abs(value - previous.value) > allowedDelta) return "flagged";
  }
  return "valid";
}
```
`[VERIFIED: SPEC.md:15 — "range check + rate-of-change check: เปลี่ยนแปลงเกิน 5°C ภายใน 10 วินาที ถือว่าผิดปกติ" — temperature rate-of-change limit is exactly 5°C/10s per SPEC.md A1]`. **Note:** SPEC.md defines the 5°C/10s rate-of-change threshold for temperature (A1) explicitly, but does **not** define an equivalent numeric rate-of-change threshold for humidity in B1 (B1 only says "validation rule เดียวกับ A1" — "same validation rule as A1" — which is ambiguous as to whether the *numeric* 5-unit threshold applies to %RH too, or only the *mechanism*). This is flagged as an Open Question below — the `maxDeltaPer10s: 15` value in the example above is a placeholder `[ASSUMED]`, not a verified SPEC threshold, and must not be locked in without clarification.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| API-key-only device "authentication" | HMAC-signed payload + anti-replay nonce/timestamp | Long-standing IoT security best practice, not a recent change | API keys alone don't stop replay — this project's own PITFALLS.md (Pitfall 4) and CONTEXT.md's D-02 both already commit to the stronger pattern. |
| bcrypt as the default password hash | argon2id as OWASP's first-choice recommendation | OWASP 2024+ guidance `[CITED]` | Still project-discretionary here given native-binary deployment friction — see Alternatives Considered. |
| Manual cron-based time-series downsampling/retention | Native `add_retention_policy()` / continuous aggregates | TimescaleDB has supported this for multiple major versions; not a "recent" change but still commonly hand-rolled by teams unfamiliar with the feature | Directly avoids the "why is this query slow after 3 months" failure mode `[CITED: STACK.md]`. |

**Deprecated/outdated:** None specific to this phase's exact scope beyond the above.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Exact HMAC canonical-string format (`method\npath\ntimestamp\nnonce\nrawBody`) and header names (`X-Device-Id`, `X-Timestamp`, `X-Nonce`, `X-Signature`) | HMAC Signing Scheme | Low-medium — this is an internal protocol between firmware and backend both built in this project; any format works as long as firmware and backend agree, but changing it post-field-deployment is costly per D-01's reversibility note. |
| A2 | 30-second timestamp window for anti-replay | HMAC Signing Scheme | Low — too tight could reject legitimate devices with clock drift; too loose weakens anti-replay. Should be confirmed against actual ESP32 firmware clock-sync reliability during implementation. |
| A3 | Monotonic-timestamp-as-nonce simplification (reject non-increasing timestamps) instead of a full nonce-history table | HMAC Signing Scheme, TimescaleDB Schema | Medium — requires firmware to guarantee strictly increasing timestamps; if firmware clock can jump backward (e.g., NTP resync), legitimate readings could be rejected. Verify ESP32 firmware's time source behavior before locking in. |
| A4 | `maxDeltaPer10s: 15` placeholder for humidity rate-of-change | Code Examples | Medium — SPEC.md does not specify this numeric threshold for humidity; using a wrong placeholder could over- or under-flag readings until corrected. See Open Questions. |
| A5 | Wide-vs-narrow TimescaleDB table format recommendation (narrow/long chosen) | TimescaleDB Schema | Low-medium — affects query ergonomics for Phase 2/3, not a correctness issue; easy to change before other phases depend on the schema, costly after. |
| A6 | `bcrypt` recommended over `argon2` as the *default* pick for this phase specifically due to native-binary deployment friction | Standard Stack, Alternatives Considered | Low — both are secure choices; wrong call here just means suboptimal (not insecure) hashing strength, and is easy to swap before any real user accounts exist. |
| A7 | TLS is terminated at a reverse proxy in production (Express only enforces via `X-Forwarded-Proto`) rather than Express terminating TLS directly | Architectural Responsibility Map, Pitfall 5 | Medium — if the actual deployment target has no reverse proxy, Express must terminate TLS itself (`https.createServer` with cert/key), which is a different code path entirely. Must be confirmed against actual deployment target before implementation. |

**If this table is empty:** N/A — table populated above.

## Open Questions

1. **What is the numeric rate-of-change threshold for humidity (B1)?**
   - What we know: SPEC.md A1 specifies exactly 5°C/10s for temperature; B1 says only "validation rule เดียวกับ A1" (same rule as A1) without repeating a numeric %RH threshold.
   - What's unclear: Whether "same rule" means "same 5-units-per-10s number applied to %RH" or "same mechanism, different (unspecified) number."
   - Recommendation: Flag for discuss-phase/domain-expert confirmation before implementation; use a conservative placeholder (e.g., 5%RH/10s, mirroring the temperature number literally) if a decision is needed to unblock coding, but mark it clearly as pending confirmation, consistent with SPEC.md's own preamble note that all numeric thresholds are placeholders pending expert review.

2. **Does this deployment terminate TLS at Express directly, or behind a reverse proxy?**
   - What we know: SEC-01 requires "TLS for every endpoint"; STACK.md and this research assume a fronting reverse proxy is the more common production pattern.
   - What's unclear: The actual target deployment environment (bare VM, Docker Compose behind nginx/Caddy, a managed platform with automatic TLS) was not specified in CONTEXT.md or PROJECT.md.
   - Recommendation: Planner should make this an explicit task-level decision (either "Express terminates TLS via `https.createServer` + certs" or "Express trusts a documented reverse-proxy `X-Forwarded-Proto` header") rather than leaving it implicit, since the two require materially different code.

3. **Nonce-table vs. monotonic-timestamp for anti-replay — should camera devices (Phase 5, out of scope now) share the same `devices` table/auth mechanism?**
   - What we know: D-03 already generalizes to "N sensor devices" per zone; SPEC.md's Tech Stack section says cameras also need device authentication (Security §3) per SEC-03's phrasing ("Sensors and cameras authenticate...").
   - What's unclear: Whether Phase 1 should build the `devices` table generically enough to cover camera device rows now (even though Phase 5 wires up actual camera ingest), or whether that's premature.
   - Recommendation: Build the `devices`/auth mechanism generically now (device_type column, sensor_type nullable) since it costs little extra now and D-03 already anticipates a general device model — avoids a schema migration when Phase 5 lands.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Backend runtime | Not probed in this research session (greenfield repo, no host shell access to target deployment) | 22.x LTS required per STACK.md | If unavailable at execution time, install via nvm/official installer before Phase 1 execution begins |
| PostgreSQL + TimescaleDB extension | Time-series storage | Not probed — no running DB instance in this research environment | Postgres 16.x or 17.2+; TimescaleDB 2.23+ | Docker Compose (`timescale/timescaledb` official image) is the standard zero-install path — recommend this as the default for local dev and initial deployment per STACK.md's Docker Compose recommendation |
| Docker / Docker Compose | Local orchestration of Node API + TimescaleDB | Not probed | — | If Docker is unavailable, a native Postgres install with the TimescaleDB extension compiled/packaged for the host OS is the fallback, but meaningfully more setup friction |

**Missing dependencies with no fallback:** None identified — every dependency has a viable fallback path (native install vs. Docker).
**Missing dependencies with fallback:** Node.js version pin and TimescaleDB availability should both be verified as the first executable task in Phase 1's plan (a "Wave 0" environment-setup task), since this research session had no shell access to the actual target deployment host.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes | Human: `jose`-based JWT + `bcrypt`/`argon2` password hashing. Device: HMAC-SHA256 signed payload (not a V2-covered "authentication" mechanism per se, but the project's functional equivalent for non-human actors) |
| V3 Session Management | Yes | JWT expiry (short-lived, e.g. 1hr) for human sessions; no session management needed for stateless device HMAC auth |
| V4 Access Control | Yes | `requireRole` middleware (SEC-02) — server-side enforcement on every protected route, never client-trusted |
| V5 Input Validation | Yes | `zod` schemas at every API boundary (sensor payloads, admin/user request bodies) — SENS-02's range/rate-of-change check is a *business-rule* validation layered on top of zod's *type-shape* validation |
| V6 Cryptography | Yes | `crypto.createHmac`/`crypto.timingSafeEqual` (Node built-in, do not hand-roll); `bcrypt`/`argon2` for password hashing (never hand-roll password hashing) |
| V9 Communications | Yes | TLS enforcement (SEC-01) — see Pitfall 5 for the reverse-proxy-trust nuance |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Replay attack (captured valid sensor/actuator payload resent later) | Tampering / Spoofing | Anti-replay nonce/timestamp check (monotonic `last_accepted_ts`), independent of signature validity — this is the project's own PITFALLS.md Pitfall 4, directly addressed by D-02 |
| Sensor data spoofing (forged temperature/humidity to trigger a dangerous actuator response) | Spoofing | HMAC signature verification rejects any payload not signed by a known device's secret |
| Timing side-channel on signature comparison | Information Disclosure | `crypto.timingSafeEqual`, never `===` or a hand-rolled comparison loop |
| Privilege escalation via missing/misconfigured RBAC check | Elevation of Privilege | `requireRole` middleware on every actuator-control and admin-only route; test coverage should include a "viewer attempts an admin action → 403" case |
| Credential stuffing / brute-force login | Spoofing | Rate-limit the login endpoint specifically (separate limiter config from the device-ingest limiter); `bcrypt`/`argon2` cost factor makes offline brute-force expensive even if the hash DB leaks |
| Device secret compromise with no revocation path | Spoofing / Repudiation | `revoked_at` column on `devices` table (in the schema above) + an admin-only revoke endpoint — directly addresses PITFALLS.md's "no revocation path for burned-in ID" integration gotcha |

## Sources

### Primary (HIGH confidence)
- npm registry (`npm view <package> version`) — live version verification for `express`, `pg`, `zod`, `jose`, `helmet`, `bcrypt`, `express-rate-limit`, `drizzle-orm`, `argon2`, `pino`, `node-cron`, `opossum` on 2026-08-18.
- `gsd-tools query package-legitimacy check` — download counts, publish dates, repo URLs, postinstall-script check for all packages above.

### Secondary (MEDIUM confidence)
- [TimescaleDB continuous aggregates docs (timescale/docs mirror)](https://github.com/timescale/docs/blob/latest/use-timescale/data-retention/data-retention-with-continuous-aggregates.md) and [Continuous aggregates overview | Tiger Data Docs](https://www.tigerdata.com/docs/reference/timescaledb/continuous-aggregates) — CREATE MATERIALIZED VIEW / add_continuous_aggregate_policy / add_retention_policy syntax.
- [How to Implement HMAC Request Signing for Secure API Authentication in Node.js (2026 Guide) - DEV Community](https://dev.to/1xapi/how-to-implement-hmac-request-signing-for-secure-api-authentication-in-nodejs-2026-guide-3b3f), [How to Secure APIs with HMAC Signing in Node.js - oneuptime.com](https://oneuptime.com/blog/post/2026-01-26-nodejs-hmac-api-security/view) — canonical string construction, nonce/timestamp anti-replay pattern.
- [Bun/Node crypto.timingSafeEqual reference](https://bun.com/reference/node/crypto/timingSafeEqual) and cross-checked HMAC-SHA256 constant-time comparison sources — timing-attack rationale.
- [Building Role-Based Access Control (RBAC) in Express - Towards Dev / Medium](https://medium.com/towardsdev/building-role-based-access-control-rbac-in-express-a-practical-guide-1f790b5aead0), [Auth0 Express RBAC code sample](https://developer.auth0.com/resources/code-samples/api/express/basic-role-based-access-control) — requireRole/authorizeRoles middleware pattern.
- OWASP password-storage guidance on Argon2id vs bcrypt (via cross-checked web search summarizing OWASP's 2024+ recommendation) — password hashing algorithm choice.
- `.planning/research/STACK.md`, `.planning/research/ARCHITECTURE.md`, `.planning/research/PITFALLS.md` (project-internal, already MEDIUM-confidence per their own metadata) — reused directly for stack defaults, architecture shape, and the replay-attack/sensor-drift pitfalls this phase must address.

### Tertiary (LOW confidence)
- None used as a sole/uncorroborated source in this document — all web-search findings above were cross-checked across 2+ independent results per topic.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every package version verified live against npm registry this session; only the *choice* of bcrypt-vs-argon2 remains a discretionary judgment call, clearly flagged as such.
- Architecture: MEDIUM-HIGH — TimescaleDB DDL pattern and HMAC middleware pattern are cross-checked against multiple sources and this project's own prior research, but the exact SQL/code has not been executed against a live database/server in this session — planner/executor should smoke-test before treating as final.
- Pitfalls: HIGH — directly extends the project's own `PITFALLS.md` (already cross-checked, MEDIUM confidence at the source level) with phase-specific concrete mitigations (schema columns, middleware ordering, tests to write).

**Research date:** 2026-08-18
**Valid until:** 2026-09-17 (30 days — npm package versions and TimescaleDB/Node ecosystem move fast; re-verify versions before `npm install` if this research is consumed after that date)

---
*Phase 1 research for: AI Smart Mushroom Farm — Foundation: Sensing & Device Security*
*Researched: 2026-08-18*
