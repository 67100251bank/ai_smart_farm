# Phase 1: Foundation — Sensing & Device Security - Pattern Map

**Mapped:** 2026-08-18
**Files analyzed:** 16 (new files this phase creates; 0 modified — greenfield)
**Analogs found:** 0 / 16 — **this is a greenfield repository**

## Greenfield Notice

`find . -not -path './.git*' -not -path './.planning*' -not -path './.claude*'` returns only `SPEC.md`. There is no existing application code, no `src/`, no prior controllers/services/middleware of any kind in this repository. Every file below is a **new file with no existing codebase analog**. No project-internal `CLAUDE.md` and no `.claude/skills/`/`.agents/skills/` directories exist in the working directory either, so there are no project-specific coding-convention overrides beyond what SPEC.md/CONTEXT.md/RESEARCH.md already establish.

Because there is nothing to copy from in this codebase, this document instead:
1. Classifies every file RESEARCH.md's "Recommended Project Structure" says this phase will create, by role and data flow.
2. Points the planner at the **exact code skeletons RESEARCH.md already wrote** (Pattern 1: HMAC device auth, Pattern 2: RBAC middleware, TimescaleDB DDL, zod validator) as the closest thing to an "analog" available — these are synthesized reference patterns, not verified-working code, and are labeled as such below.
3. Flags every file as "no existing codebase analog — greenfield" per the orchestrator's instruction, rather than fabricating a reference to code that doesn't exist.

**Downstream note for later phases:** once this phase's files exist, Phase 2/3/4/5 pattern-mapping runs SHOULD treat `src/ingest/deviceAuth.ts`, `src/auth/requireRole.ts`, and `src/db/repositories/*` as real in-repo analogs — this greenfield state is specific to Phase 1 only.

## File Classification

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|-----------------|---------------|
| `backend/src/ingest/deviceAuth.ts` | middleware | request-response (auth gate) | none — greenfield | no analog |
| `backend/src/ingest/validators.ts` | utility | transform (validation) | none — greenfield | no analog |
| `backend/src/ingest/ingestController.ts` | controller | request-response → CRUD (insert) | none — greenfield | no analog |
| `backend/src/auth/userAuth.ts` | service | request-response (auth) | none — greenfield | no analog |
| `backend/src/auth/requireRole.ts` | middleware | request-response (authz gate) | none — greenfield | no analog |
| `backend/src/auth/bootstrapAdmin.ts` | utility | batch (first-run setup) | none — greenfield | no analog |
| `backend/src/devices/deviceRegistry.ts` | service | CRUD | none — greenfield | no analog |
| `backend/src/devices/deviceRoutes.ts` | route | request-response | none — greenfield | no analog |
| `backend/src/zones/zoneRoutes.ts` | route | CRUD | none — greenfield | no analog |
| `backend/src/readings/readingsQuery.ts` | controller | request-response (read/query) | none — greenfield | no analog |
| `backend/src/db/pool.ts` | config | — (connection setup) | none — greenfield | no analog |
| `backend/src/db/migrations/*.sql` | migration | batch (DDL) | none — greenfield | no analog |
| `backend/src/db/repositories/deviceRepository.ts` | model | CRUD | none — greenfield | no analog |
| `backend/src/db/repositories/readingRepository.ts` | model | CRUD | none — greenfield | no analog |
| `backend/src/db/repositories/userRepository.ts` | model | CRUD | none — greenfield | no analog |
| `backend/src/middleware/tlsEnforce.ts` | middleware | request-response (gate) | none — greenfield | no analog |
| `backend/src/middleware/errorHandler.ts` | middleware | request-response (error formatting) | none — greenfield | no analog |
| `backend/src/config/thresholds.ts` | config | — (constants) | none — greenfield | no analog |
| `backend/tests/*.test.ts` | test | request-response (integration) | none — greenfield | no analog |

## Pattern Assignments

Every file below has **no existing codebase analog — greenfield**. In place of a codebase analog, the excerpts here are RESEARCH.md's own synthesized reference skeletons — carry the `[ASSUMED — synthesized pattern]` / `[CITED]` provenance tags through into the plan; these are starting points to adapt, not copy-paste-verified-working code (RESEARCH.md's own caveat).

### `backend/src/ingest/deviceAuth.ts` (middleware, request-response auth gate)

**Analog:** none — greenfield. **Reference skeleton:** RESEARCH.md "Pattern 1: HMAC Device Authentication Middleware (Exact Design)" (01-RESEARCH.md lines 216-279).

**Core pattern (full skeleton, RESEARCH.md lines 229-278):**
```typescript
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

**Error handling pattern:** every failure branch returns `401` immediately (no `next()` call, no DB write) and calls `logSecurityEvent(...)` first — this is D-02's "reject outright, no data written, security event logged" requirement encoded directly in control flow, not left to a downstream error handler.

**Provenance:** `[ASSUMED — synthesized pattern: canonical-string format, header names, and monotonic-timestamp-as-nonce simplification are RESEARCH.md's design choices this session, informed by CITED general HMAC-signing guidance, not copied from a single authoritative source]`. Verify header names don't collide with any firmware convention before locking in (RESEARCH.md line 279).

---

### `backend/src/ingest/validators.ts` (utility, transform/validation)

**Analog:** none — greenfield. **Reference skeleton:** RESEARCH.md "Code Examples → Sensor payload validation" (01-RESEARCH.md lines 442-470).

**Core pattern (full skeleton):**
```typescript
import { z } from "zod";

export const sensorReadingSchema = z.object({
  temperature: z.number().optional(),
  humidity: z.number().optional(),
}).refine(d => d.temperature !== undefined || d.humidity !== undefined, {
  message: "at least one of temperature/humidity required",
});

const RANGE = {
  temperature: { min: -10, max: 60, maxDeltaPer10s: 5 },
  humidity:    { min: 0,   max: 100, maxDeltaPer10s: 5 }, // D-05: 5%RH/10s [ASSUMPTION]
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

**Note:** CONTEXT.md D-05 resolves RESEARCH.md's Open Question #1 — humidity `maxDeltaPer10s` is locked to `5` (not the `15` placeholder RESEARCH.md's raw example used), explicitly flagged `[ASSUMPTION] pending domain-expert confirmation`. The planner must use `5`, not RESEARCH.md's literal example value, and must not discard the "always persist, never discard" behavior — `classifyReading` returns a status string, it never throws/rejects (this is what distinguishes SENS-02 out-of-range handling from D-02 auth rejection).

**Validation approach:** two-layer — `zod` schema for shape/type (`sensorReadingSchema`), then a separate hand-written business-rule function (`classifyReading`) for range + rate-of-change. Keep these as two distinct functions/files-sections, not merged into one zod `.refine()`, since the rate-of-change check needs the previous reading (stateful lookup), which zod schemas can't naturally express.

---

### `backend/src/auth/requireRole.ts` (middleware, request-response authz gate)

**Analog:** none — greenfield. **Reference skeleton:** RESEARCH.md "Pattern 2: RBAC Middleware for Human Users" (01-RESEARCH.md lines 283-308).

**Core pattern (full skeleton):**
```typescript
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

**Provenance:** `[CITED: Express RBAC middleware pattern — requireRole/authorizeRoles factory checking role array membership, cross-checked across multiple web sources]` — this is the closest thing to a "verified" pattern in this phase (cross-checked against multiple external sources, not merely synthesized), even though it has no in-repo analog.

**Cross-cutting note:** this file establishes the RBAC pattern that Phase 3's actuator-control routes will reuse verbatim (RESEARCH.md line 310) — build it generically now (`allowedRoles: string[]` factory, not a hardcoded set of route-specific checks).

---

### `backend/src/db/migrations/0001_init.sql` (migration, batch DDL)

**Analog:** none — greenfield. **Reference skeleton:** RESEARCH.md "TimescaleDB Schema (Exact Design)" (01-RESEARCH.md lines 328-406) — full DDL for `zones`, `devices`, `users`, `sensor_readings` hypertable, `sensor_readings_hourly` continuous aggregate, and two `add_retention_policy()` calls. See RESEARCH.md lines 332-402 for the complete SQL; do not duplicate here — reference directly.

**Key structural notes for the planner:**
- `devices` table includes `zone_id` (D-03 zone model), `sensor_type` + generic device-type framing (D-07 — camera-ready without migration), `last_accepted_ts BIGINT` (anti-replay state, durable per Pitfall 2), `calibrated_at` (Pitfall 3 — capture now even though drift-detection logic is out of scope), and `revoked_at` (revocation path).
- `sensor_readings` uses narrow/long format (`metric` + `value` columns), not wide — RESEARCH.md flags this explicitly as an open decision the planner should make explicit rather than silently accept (RESEARCH.md line 406, Assumption A5).
- Two separate `add_retention_policy()` calls are required — one on the raw hypertable (90 days), one on the continuous aggregate (2 years) — a common mistake is applying only one.

**Provenance:** `[CITED: TimescaleDB continuous-aggregate + retention-policy pattern, cross-checked against Timescale's own docs]` for the mechanism; `[ASSUMED]` for the exact column/table names, which are this session's schema synthesis to fit D-01/D-03/D-07. RESEARCH.md explicitly warns: "Before locking this into a migration file, run it against a real TimescaleDB instance" (line 404) — treat as a strong starting draft requiring a smoke test, not verified-working SQL.

---

### `backend/src/middleware/tlsEnforce.ts` (middleware, request-response gate)

**Analog:** none — greenfield. **Reference guidance:** RESEARCH.md "Pitfall 5" (01-RESEARCH.md lines 434-438) and CONTEXT.md D-06.

**Core pattern (guidance, no literal code skeleton provided in RESEARCH.md — planner must write this one from the described shape):**
- Per D-06: TLS terminates at a reverse proxy (nginx/Caddy) in front of Express; Express does not call `https.createServer`.
- Must call `app.set('trust proxy', 1)` (or the specific proxy count/IP range) — RESEARCH.md line 437.
- Middleware checks `req.header('x-forwarded-proto') === 'https'` and rejects (redirect or 400/496-style reject) otherwise.
- **Warning sign to avoid** (RESEARCH.md line 438): "No explicit `trust proxy` configuration, or TLS-enforcement middleware exists only as a comment/TODO" — this must be a real, tested middleware, not a placeholder.

**Flagged:** D-06 is explicitly marked `[ASSUMPTION]` — deployment target (bare VM vs. managed platform) was never specified; revisit if the target turns out to have no reverse proxy in front of it.

---

## Shared Patterns

### Security-event logging (D-02)
**Source:** RESEARCH.md Pattern 1 (`logSecurityEvent(...)` calls inline in `deviceHmacAuth`), Standard Stack table row for `pino` (01-RESEARCH.md line 79).
**Apply to:** `deviceAuth.ts`, `userAuth.ts` (failed-login attempts), any RBAC 403 path worth auditing.
**Guidance:** Use `pino` for structured JSON logs so repeated auth failures per device/user can be alerted on later. No concrete `logSecurityEvent` implementation exists yet in RESEARCH.md — the planner should treat this as a small new utility (e.g., `backend/src/utils/securityLog.ts`) wrapping a `pino` logger instance, called from every middleware's reject branch.

### Constant-time comparison for all secret comparisons
**Source:** RESEARCH.md "Why `timingSafeEqual`, not `===`" (01-RESEARCH.md lines 281, "Don't Hand-Roll" table line 322).
**Apply to:** `deviceAuth.ts` signature check (already in the skeleton above). Any future secret-comparison code (e.g., if API keys are ever compared directly) must reuse `crypto.timingSafeEqual`, never `===`/string equality.

### RBAC ordering: jwtAuth before requireRole
**Source:** RESEARCH.md Pattern 2 usage comment (01-RESEARCH.md lines 304-306).
**Apply to:** Every protected human-facing route (`deviceRoutes.ts` admin-only registration, `zoneRoutes.ts`, `readingsQuery.ts`). Middleware order must always be `jwtAuth, requireRole([...]), controller` — `requireRole` assumes `req.user` was already set by a prior JWT-verification middleware; never chain it standalone.

### Device-auth and human-auth structural separation
**Source:** RESEARCH.md "Structure Rationale" (01-RESEARCH.md lines 211-212) and the architecture diagram's two parallel route trees (lines 141-165).
**Apply to:** Route wiring in the top-level Express app — `/api/v1/ingest/*` must only ever have `deviceHmacAuth` in its middleware chain; `/api/v1/auth/*`, `/api/v1/users/*`, `/api/v1/zones/*`, `/api/v1/readings/*` must only ever have `jwtAuth`/`requireRole`. Never mix the two — devices never receive a JWT, humans never hold a device HMAC secret.

### Rate limiting keyed by device_id, not IP
**Source:** RESEARCH.md "Pitfall 4" (01-RESEARCH.md lines 428-432).
**Apply to:** Ingest routes only (post-auth). Must override `express-rate-limit`'s default `keyGenerator` to use `req.header('X-Device-Id')`, since default IP-keying breaks when multiple devices share one NAT/local network — a realistic greenhouse deployment topology.

### Externalized numeric thresholds
**Source:** RESEARCH.md "Structure Rationale" (01-RESEARCH.md line 214), `config/thresholds.ts` in the recommended structure.
**Apply to:** `validators.ts` must import range/rate-of-change constants (-10/60°C, 0/100%RH, 5°C/10s, 5%RH/10s per D-05, ±30s auth window) from `backend/src/config/thresholds.ts` rather than hardcoding them inline — SPEC.md's own preamble flags these as placeholder values pending domain-expert review, so a config-file change (not a code change) must be sufficient to update them later.

## No Analog Found

All 16+ files in this phase have no codebase analog (greenfield repo). Rather than repeat the full list again, see "File Classification" above — every row's "Closest Analog" column reads "none — greenfield."

The **absence of a fabricated analog is intentional**: per the orchestrator's explicit instruction, this document does not invent a pattern reference where none exists. RESEARCH.md's own synthesized code skeletons (Pattern 1, Pattern 2, TimescaleDB DDL, zod validator) are the best available reference material and are cited above with their original provenance tags (`[CITED]` vs. `[ASSUMED — synthesized pattern]`) preserved so the planner does not mistake research-synthesized code for verified-working, previously-shipped code.

## Metadata

**Analog search scope:** entire repository (`find . -not -path './.git*' -not -path './.planning*' -not -path './.claude*'` → only `SPEC.md` returned; no `.claude/skills/`, `.agents/skills/`, or working-directory `CLAUDE.md` found either)
**Files scanned:** 1 (`SPEC.md` — not a code file, not a pattern source)
**Pattern extraction date:** 2026-08-18
