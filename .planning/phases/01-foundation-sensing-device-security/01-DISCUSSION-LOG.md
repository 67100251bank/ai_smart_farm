# Phase 1: Foundation — Sensing & Device Security - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-18
**Phase:** 1-Foundation — Sensing & Device Security
**Areas discussed:** Device provisioning & key management, Malformed/failed-auth payload handling, Zone/device topology for v1, User & role provisioning

**Mode:** `--auto` — no interactive prompts were shown to the user. For each area, Claude selected the recommended option and logged it below for audit.

---

## Device provisioning & key management

| Option | Description | Selected |
|--------|-------------|----------|
| Admin-issued registration endpoint (secret shown once) | Admin API generates device_id + HMAC secret, returned once at registration | ✓ |
| Pre-shared factory keys | Keys baked in at manufacturing time, never rotated via API | |
| Self-registering devices (trust-on-first-use) | Device generates its own key and registers itself on first contact | |

**Selected:** Admin-issued registration endpoint (recommended default — matches STACK.md's HMAC device-auth pattern and SEC-03's "signed, per-device identity" requirement without needing physical factory-provisioning infrastructure for a single-greenhouse deployment).
**Notes:** [auto] Selected because it's the lowest-infrastructure option that still gives each device a verifiable, revocable identity.

---

## Malformed / failed-auth payload handling

| Option | Description | Selected |
|--------|-------------|----------|
| Reject outright (401 + security log, no write) | Auth/replay failure never reaches validation or storage | ✓ |
| Accept but flag as anomalous | Treat auth failures the same as out-of-range sensor values | |

**Selected:** Reject outright.
**Notes:** [auto] Auth failure is a security event, not a data-quality event (SPEC A1/SENS-02's "flag but retain" rule applies to authenticated-but-implausible readings, not to unauthenticated/replayed ones) — conflating the two would let an attacker inject readings that merely get "flagged," which defeats SEC-03.

---

## Zone/device topology for v1

| Option | Description | Selected |
|--------|-------------|----------|
| Configurable N devices per zone | Data model supports multiple sensors, each assigned to a zone | ✓ |
| Hardcoded single sensor, single zone | Simplest possible v1, no zone concept | |

**Selected:** Configurable N devices per zone.
**Notes:** [auto] Phase 3's CTRL-06 (per-zone humidity target) already requires a zone concept — building it into Phase 1's data model now avoids a schema rework two phases later.

---

## User & role provisioning

| Option | Description | Selected |
|--------|-------------|----------|
| Bootstrapped admin + admin-created accounts (no self-service signup) | Single admin seeded at deploy; admin creates operator/viewer accounts | ✓ |
| Self-service signup with email verification | Standard SaaS-style signup flow | |

**Selected:** Bootstrapped admin + admin-created accounts.
**Notes:** [auto] Matches PROJECT.md's single-greenhouse, single-operation scope — self-service signup is unnecessary complexity/attack surface for a system where the operator set is small and known in advance.

---

## Claude's Discretion

- Exact HMAC algorithm and nonce/timestamp window sizing
- Specific TimescaleDB hypertable / continuous-aggregate configuration details

## Deferred Ideas

None raised — discussion stayed within Phase 1 scope.
