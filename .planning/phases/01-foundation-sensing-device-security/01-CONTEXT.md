# Phase 1: Foundation — Sensing & Device Security - Context

**Gathered:** 2026-08-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Greenhouse sensor data flows into the system securely, validated, and durably stored, so every later phase (dashboard, control, AI, CV) has trustworthy ground truth to build on. In scope: device authentication (signed payload + anti-replay), sensor-ingest API, range/rate-of-change validation, time-series + relational storage with the specified retention windows, and RBAC/TLS on all endpoints. Out of scope: dashboard UI (Phase 2), actuator control (Phase 3), AI/CV (Phases 4-5) — this phase only produces trustworthy stored readings.

</domain>

<decisions>
## Implementation Decisions

*Gathered in `--auto` mode — Claude selected the recommended option for each area below (no interactive prompts). All choices are consistent with SPEC.md's hardened requirements and `.planning/research/STACK.md`/`ARCHITECTURE.md`.*

### Device provisioning & key management
- **D-01:** New sensor/camera devices are registered via an admin-only API endpoint that generates a `device_id` + HMAC secret; the secret is returned once at registration time and never re-displayed or re-transmittable — the device firmware/config must store it at provisioning time. — **Reversibility:** costly — rotating the scheme later means re-provisioning every physical device in the field.

### Malformed / failed-auth payload handling
- **D-02:** A payload that fails signature verification or anti-replay (nonce/timestamp) checking is rejected outright (401, no data written, security event logged) — this is distinct from an authenticated-but-out-of-range reading (SPEC A1/SENS-02), which is still accepted and flagged, not rejected.

### Zone/device topology for v1
- **D-03:** The system supports N sensor devices, each assigned to exactly one greenhouse "zone" (a zone = the unit SPEC's per-zone humidity target, B4/CTRL-06, already operates on). v1 ships with a configurable zone/device model, not a hardcoded single-sensor assumption — this avoids a rework when Phase 3's per-zone humidity targets land.

### User & role provisioning
- **D-04:** No self-service signup for v1 — a single admin account is bootstrapped at deploy time (env-var or first-run setup), and that admin creates operator/viewer accounts via API. Matches the single-greenhouse, small-operator-team scope already set in PROJECT.md.

### Claude's Discretion
- Exact HMAC algorithm/nonce window sizing, and the specific TimescaleDB hypertable/continuous-aggregate configuration, are left to the researcher/planner — STACK.md already gives a strong default (HMAC-SHA256 + timestamp/nonce; TimescaleDB continuous aggregates for the 90-day-raw/2-year-hourly split).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Locked requirements & numeric thresholds
- `SPEC.md` (repo root) — the hardened original spec. §A1/B1 (sensor validation ranges/rate-of-change), §A3/B3 (retention windows), §Security (auth/TLS/device-auth/rate-limit requirements), §Edge Cases E1/E2 (sensor-fail/anomalous-value behavior) all apply directly to this phase. This is the authoritative source for every numeric threshold — do not re-derive them.
- `.planning/REQUIREMENTS.md` — SENS-01/02/03, SEC-01/02/03 (this phase's requirement IDs)
- `.planning/ROADMAP.md` §Phase 1 — goal + success criteria this phase must satisfy

### Stack & architecture decisions (research-backed)
- `.planning/research/STACK.md` — Node 22 LTS + Express 5 + PostgreSQL/TimescaleDB, per-device HMAC-signed payloads, device-auth pattern recommendation
- `.planning/research/ARCHITECTURE.md` — ingest → validate → time-series-store pipeline shape, event-bus decoupling from downstream consumers (dashboard/control)
- `.planning/research/PITFALLS.md` — Pitfall 4 (replay-attack gap: signed payload alone is not enough, anti-replay nonce/timestamp is required) and Pitfall 1 (sensor drift vs. noise — capture calibration metadata now even if drift-alerting logic lands later)

</canonical_refs>

<code_context>
## Existing Code Insights

This is a greenfield project — no application code exists yet (repo currently contains only `SPEC.md`, `.claude/CLAUDE.md`, and `.planning/`).

### Reusable Assets
- None yet — this phase creates the foundational ingest/storage code other phases will build on.

### Established Patterns
- None yet.

### Integration Points
- This phase's ingest API and TimescaleDB schema are the integration point every later phase depends on (dashboard reads the same store; Phase 3's control loop reads the same validated-reading stream per ARCHITECTURE.md).

</code_context>

<specifics>
## Specific Ideas

No specific UI/UX or bespoke behavioral requests for this phase — it is backend infrastructure. Follow SPEC.md's numeric thresholds and STACK.md's recommended stack exactly; no open creative decisions here.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Severity-tiered alerting, stability/variance alerting, and species-specific thresholds are already tracked as v2 requirements in REQUIREMENTS.md, not phase-1 scope.)

</deferred>

---

*Phase: 1-Foundation — Sensing & Device Security*
*Context gathered: 2026-08-18*
