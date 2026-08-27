# Project Research Summary

**Project:** AI Smart Mushroom Farm
**Domain:** IoT environmental control + AI/CV greenhouse monitoring (mushroom cultivation)
**Researched:** 2026-08-18
**Confidence:** MEDIUM

## Executive Summary

This is a physical-safety-critical IoT control system, not a typical CRUD web app: a Node.js/Express orchestrator ingests temperature/humidity sensor data, drives real actuators (fan, humidifier, ventilation), and layers AI (forecast + pattern detection + confidence-gated recommendations) and a computer-vision pipeline (YOLOv8-based mushroom growth tracking) on top. Experts build this class of system around one non-negotiable architectural rule: AI and rule-based control logic must be interchangeable "decision" sources that both hand off to a single, shared actuator-command execution path (ack/retry/rate-limit/manual-override/safe-state/arbitration). The research is unusually consistent across all four files on this point — it's the direct fix for the domain's worst failure mode (AI unavailable or wrong → physical damage to a live crop) and the load-bearing requirement the roadmap must protect from day one.

The recommended approach: build the rule-based controller and the shared `ActuatorCommandService` *before* the AI layer exists, not as a bolted-on fallback — this ordering, confirmed independently in ARCHITECTURE.md's "Suggested Build Order" and FEATURES.md's dependency graph, is what prevents the single most damaging anti-pattern (duplicated/divergent actuator-commanding code between AI and fallback paths). Stack-wise, Node 22 LTS + Express 5 + TimescaleDB (Postgres extension, not a separate time-series DB) + two internal-only Python/FastAPI microservices (forecast via Prophet, CV via YOLOv8/ONNX Runtime) is a well-supported, right-sized choice for a single-greenhouse deployment — resist the temptation to add MQTT, InfluxDB, or multi-tenant abstractions now; they're explicitly premature per STACK.md and FEATURES.md's anti-features list.

Key risks, all with concrete mitigations already identified: (1) AI/rule-engine flapping and actuator hunting during degraded-AI transitions — needs a debounce/hysteresis window and per-actuator (not per-source) rate limiting; (2) device authentication without anti-replay (nonce/timestamp) — a signed payload alone doesn't stop a captured-and-resent command, which is a physical-safety hole in an actuator system; (3) sensor drift (distinct from noise) going undetected for months because rate-of-change checks only catch fast anomalies; (4) CV model accuracy silently degrading across a growing season due to occlusion/lighting drift with no confidence-monitoring signal; (5) static min/max thresholds missing the stability/variance and contamination-risk dynamics that actually matter for mushroom cultivation specifically. None of these are exotic — they are the standard "looks done but isn't" gaps for this domain, and PITFALLS.md maps each one to a specific phase and verification step.

## Key Findings

### Recommended Stack

Node.js 22 LTS + Express 5 for the public-facing orchestrator; PostgreSQL + TimescaleDB extension as the single datastore for both relational (users/zones/RBAC) and time-series (sensor readings) data, avoiding the common trap of standing up a separate time-series DB (InfluxDB) that isn't justified until multi-site scale. Two internal-only Python/FastAPI microservices — a forecast/pattern engine (Prophet) and a CV pipeline (YOLOv8 + ONNX Runtime) — sit behind Express, never exposed publicly, wrapped in circuit breakers (`opossum`) with short timeouts so a slow/hung AI call can never block sensor ingestion or actuator dispatch. Device authentication uses per-device HMAC-signed payloads (not mTLS, not bare API keys) — right-sized for a single-greenhouse deployment, but must include a timestamp/nonce for anti-replay (a gap identified in PITFALLS.md that STACK.md's basic HMAC recommendation alone doesn't close). The LLM (Claude API) is scoped strictly to generating human-readable recommendation text — it must never compute `target_temp`/`action` values, a repeated theme across all four research files.

**Core technologies:**
- Node.js 22 LTS + Express 5 — backend orchestrator; Express 5's built-in async error handling matters for actuator-command routes that must not crash the control process
- PostgreSQL + TimescaleDB — single datastore for relational + time-series data; native continuous aggregates/retention policies map directly to the 90-day raw / 2-year hourly-aggregate requirement
- Python 3.12 + FastAPI (x2 services) — forecast engine (Prophet) and CV pipeline (YOLOv8 + ONNX Runtime), internal REST only, never public-facing
- `opossum` circuit breaker — wraps every Node→Python/LLM call; the concrete implementation of the mandatory AI-outage fallback requirement
- Drizzle + raw `pg` (not a heavy ORM) — time-series window-function queries don't map cleanly onto ORM abstractions

### Expected Features

Table-stakes features (real-time dashboard with staleness indicator, historical trends, threshold alerting with cooldown/dedup, manual override with absolute priority, RBAC, safe-state fallback) are already fully scoped in PROJECT.md/SPEC.md and match commercial ag-tech norms closely — this is a genuine strength, not a gap. The differentiators (confidence-gated AI recommendations with mandatory human approval, rule-based fallback independent of AI uptime, CV-based growth quantification with per-metric accuracy targets against labeled data) are exactly what the ag-AI trust research says separates adopted products from disabled ones: the #1 documented farmer complaint is recommendation accuracy, and over-reliance/automation-bias is a named failure mode this system's confidence-gating already defends against — provided the UX genuinely surfaces the "reason" text and doesn't let approval become a reflexive tap.

**Must have (table stakes):**
- Real-time sensor dashboard with staleness/online/offline status — the #1 trust signal
- Threshold alerting with cooldown/dedup, extended with severity tiers (critical vs. routine) to avoid alert fatigue
- Manual override, always highest priority, with ack/retry/rate-limited actuator commands
- Safe-state fallback + rule-based controller independent of AI/network uptime
- RBAC on all control/ingest endpoints + signed device authentication

**Should have (competitive):**
- AI pattern detection + 1h/6h forecast with confidence interval (builds anticipatory trust)
- Confidence-gated structured AI recommendation (action + reason + confidence), human-approve by default
- CV-based growth metrics (size/count/coverage/color/stage) with labeled validation datasets per metric
- Conflict arbitration between temp/humidity control loops, logged for audit

**Defer (v2+):**
- Disease/anomaly detection classes and harvest-readiness — after core CV metrics are validated and stable
- Auto-apply AI mode (opt-in) — only after manual-approve mode has established trust in accuracy
- Multi-greenhouse/multi-tenant, native mobile app, flush-cycle/substrate-batch tracking — explicitly out of scope per PROJECT.md

### Architecture Approach

A monolithic Express backend is entirely sufficient for this milestone; the critical architectural decision is not about scale, it's about isolation. AI and rule-based control strategies both implement one `ControlDecisionStrategy` interface and emit an identical decision shape to a single `ActuatorCommandService`, which alone owns ack/timeout/retry/rate-limit/manual-override-lock/arbitration/safe-state logic — this is the one code path that must never be duplicated. The CV pipeline is architecturally decoupled entirely from the actuator control loop (it only feeds the dashboard/alerts), so a CV outage or slow inference can never degrade environmental safety control. Every outbound call from Express to the two Python microservices and the LLM is wrapped in a circuit breaker with a short timeout, so a hung AI call can never block sensor ingestion or actuator dispatch.

**Major components:**
1. Control Orchestrator + `ControlDecisionStrategy` (AI vs. rule-based) — decides target actuator state each cycle; strategies are interchangeable behind one interface
2. `ActuatorCommandService` — the single choke point for ack/retry/rate-limit/manual-override/arbitration/safe-state; called identically regardless of decision source
3. Forecast/Pattern Engine (Python/Prophet) + CV Pipeline (Python/YOLOv8) — internal-only microservices, circuit-breaker wrapped, architecturally isolated from each other and from the control-critical path
4. Ingest API + Time-series/Relational store (TimescaleDB) — validates and persists sensor data; feeds both the control loop and the WebSocket dashboard push as independent consumers of the same validated stream
5. LLM Recommendation-Text Generator — receives already-computed numbers, returns explanation text only, structurally cannot write to control fields

### Critical Pitfalls

1. **Sensor drift mistaken for "no anomaly"** — rate-of-change/range checks catch noise, not slow gradual drift; add a separate drift-detection mechanism (reference cross-check, calibration metadata) before CV/AI phases treat sensor history as ground truth.
2. **AI-rule-engine flapping causing actuator hunting** — a hard, undebounced cutover between AI-available and fallback states can cause rapid alternating commands on the same actuator during degraded (not fully down) AI service; add a debounce/hysteresis window and enforce rate-limiting per-actuator (not per-source).
3. **CV accuracy silently degrading across a growing season** — occlusion from dense/overlapping mushroom caps, lens/LED drift, and background changes shift the input distribution away from the initial validation set with no "camera offline" signal; budget periodic re-labeling and track model-confidence drift as its own monitored metric.
4. **Device authentication without anti-replay** — a signed payload proves *who* sent a message, not that *this* message is fresh; without a nonce/timestamp/sequence check, a captured valid sensor reading or actuator command can be replayed later — a physical-safety gap, not just a data-integrity one.
5. **Static min/max thresholds missing stability/contamination coupling** — mushroom cultivation's real risk is swings/instability and sustained-high-humidity contamination risk, not just static range breaches; the "safe" fruiting humidity range overlaps heavily with the highest-contamination-risk zone, so alerting needs a variance/stability signal alongside range checks.

## Implications for Roadmap

Based on combined research, suggested phase structure (dependency-driven, cross-validated across ARCHITECTURE.md's build order and FEATURES.md's dependency graph):

### Phase 1: Foundation — Device Auth, Ingest, Validation, Time-Series Storage
**Rationale:** Nothing else can be built or tested without real/simulated sensor data flowing in, validated, and durably stored. This is the universal prerequisite across both the control loop and (later) AI/CV phases that depend on sensor history as ground truth.
**Delivers:** Signed device authentication (with anti-replay nonce/timestamp — Pitfall 4), range/rate-of-change validation, TimescaleDB-backed time-series + relational store, RBAC scaffolding on all endpoints.
**Addresses:** Sensor ingest + validation (table stakes), device authentication (table stakes)
**Avoids:** Pitfall 4 (replay-attack gap) — build the anti-replay check in from the start, don't retrofit; Pitfall 1 (drift vs. noise) — design drift-detection metadata capture (sensor_id, calibrated_at) alongside validation, even if the drift-alert logic itself lands later.

### Phase 2: Real-Time Dashboard + Historical Trends
**Rationale:** Validates the ingest to store to real-time flow end-to-end and gives a visible, demoable system early, entirely independent of any AI component — de-risks the project before the harder AI/CV work begins.
**Delivers:** Live sensor dashboard with staleness/online/offline status, WebSocket or SSE push within SLA, historical trend charts against hourly aggregates (not raw data — Performance Trap).
**Uses:** SSE (simpler than WebSocket for this one-directional push use case per STACK.md) or `ws`; TimescaleDB continuous aggregates.
**Implements:** Event bus decoupling ingestion from dashboard push (Architecture Component 3).

### Phase 3: Rule-Based Control + Shared ActuatorCommandService (Safety Baseline)
**Rationale:** Must come *before* the AI control strategy, not after — this is the single most load-bearing ordering decision in all four research files. Building AI-first and retrofitting a fallback is the direct cause of Anti-Pattern 1 (duplicated/divergent actuator logic). This phase also makes the system deployable and safe even before any ML model exists.
**Delivers:** `ControlDecisionStrategy` interface, `RuleBasedStrategy`, `ActuatorCommandService` (ack/retry/rate-limit/manual-override/safe-state), Safe-State Table implementation, conflict arbitration module (B7).
**Addresses:** Manual override (table stakes), safe-state fallback (table stakes/differentiator), conflict arbitration (differentiator)
**Avoids:** Anti-Pattern 1 (duplicated actuator logic); Pitfall 2's oscillation risk — build per-actuator (not per-source) rate limiting and hysteresis/debounce logic into this shared service from day one, since it's far cheaper here than retrofitted later.

### Phase 4: AI Forecast/Pattern Engine + AIControlStrategy + Confidence Gating
**Rationale:** Now pluggable behind the interface established in Phase 3 — this is where the "AI-assisted" core value differentiator lands, but it must slot into the existing safety scaffolding, not create a parallel one.
**Delivers:** Python/FastAPI forecast microservice (Prophet), pattern detection, `AIControlStrategy` wrapped in a circuit breaker, confidence-gated recommendation logic (no auto-apply below threshold), debounced AI/fallback transition.
**Uses:** Prophet, `opossum` circuit breaker, FastAPI/Pydantic schemas.
**Implements:** Pattern 1 (Strategy Pattern) and Pattern 2 (Circuit Breaker) from ARCHITECTURE.md.

### Phase 5: LLM Recommendation-Text Generation
**Rationale:** Trivial to add once Phase 4 produces structured decisions; purely additive with no control-path risk if the schema boundary is enforced correctly.
**Delivers:** Claude API integration that receives already-computed action/target/confidence and returns explanation text only, with a schema boundary that structurally prevents LLM output from reaching numeric control fields.
**Addresses:** AI recommendation differentiator (explainability, the documented #1 trust-building lever)
**Avoids:** Anti-Pattern 3 — LLM-generated numbers leaking into control logic.

### Phase 6: Alerting/Notification Layer with Severity Tiers
**Rationale:** Can be built in parallel with Phases 2-5 once thresholds and cooldown rules are defined; depends on ingest (Phase 1) and control state (Phase 3) for its triggers.
**Delivers:** Threshold alerting with cooldown/dedup, severity tiers (critical vs. routine — Pitfall 2/UX finding), stability/variance-based alerting alongside static range checks (Pitfall 5).
**Addresses:** Threshold alerting (table stakes)
**Avoids:** Pitfall 5 (static thresholds missing contamination-risk/stability coupling) — add variance-based alerting here, flag stage-aware setpoints as a Phase 2+ follow-on once CV stage-classification (Phase 7) is validated.

### Phase 7: Camera Capture + Quality Gate + CV Pipeline
**Rationale:** Architecturally independent of the temp/humidity control path by design (it never feeds the actuator loop), so it's the most parallelizable/deferrable component — but should land after the control safety baseline (Phase 3) is proven, since CV is lower-risk and non-blocking.
**Delivers:** Capture scheduler, image quality gate (brightness/blur), YOLOv8 detection + stage/disease classification microservice, per-metric labeled validation datasets, model versioning on stored results.
**Addresses:** CV-based growth quantification (differentiator)
**Avoids:** Pitfall 3 (CV accuracy silently degrading) — build model-confidence drift monitoring and a dense/occlusion-specific test set into the initial validation, not as an afterthought; budget re-labeling as a recurring cost, not a one-time gate.

### Phase 8: Hardening — Access Control Refinement, Audit Log, Escalation
**Rationale:** Naturally last since it depends on all prior components existing to audit/restrict; a dedicated pass rather than scattered incremental work.
**Delivers:** Full audit log coverage (arbitration decisions, safe-state transitions, manual overrides, ack timeouts), escalation logic, RBAC refinement, explicit replay-attack test (capture-and-resend) as a pre-production security gate.
**Avoids:** Pitfall 4 verification (explicit replay test, not just "signed payload checked off").

### Phase Ordering Rationale

- The rule-based controller and shared command interface (Phase 3) must exist before the AI control strategy (Phase 4) — confirmed independently by ARCHITECTURE.md's build order and FEATURES.md's dependency graph ("A6 requires A5 + rule engine, not the LLM directly").
- Conflict arbitration (part of Phase 3) requires both temperature and humidity actuator commands to exist — it's meaningless and untestable in isolation, so it can't be parallelized ahead of the control loops it arbitrates.
- CV (Phase 7) is deliberately the most deferrable/parallelizable phase because the architecture keeps it fully decoupled from the safety-critical actuator path — a CV outage cannot degrade environmental control.
- Alerting (Phase 6) is sequenced to enable the rule-based fallback controller "nearly free" since it reuses the same threshold definitions — building alerting before or alongside the fallback avoids duplicate threshold logic.
- Hardening (Phase 8) is last because audit/escalation refinement requires all prior subsystems to exist to audit against.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 4 (AI Forecast/Pattern Engine):** Prophet vs. LSTM accuracy tradeoffs need validation against real data; debounce/hysteresis parameter tuning (how many consecutive healthy cycles before handing control back to AI) has no established default in the research.
- **Phase 7 (CV Pipeline):** Labeling-cost estimation is commonly wrong by 2-5x in agri-CV projects per PITFALLS.md; mushroom-specific occlusion/clustering handling is a narrower research niche than general ag-CV (tomatoes/citrus dominate the literature) — flag for phase-specific research before committing to a labeling budget/timeline.
- **Phase 3 (Rule-Based Control + Arbitration):** The stability/variance alerting design (Pitfall 5) and per-actuator rate-limiting-across-sources design have no off-the-shelf pattern in the research — needs domain-expert input on actual swing/oscillation thresholds for mushroom cultivation specifically.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Ingest/Validation):** HMAC-signed payload + nonce/timestamp anti-replay is a well-documented IoT security pattern.
- **Phase 2 (Dashboard):** Live sensor tiles + trend charts + notification center is a stable, convergent UX pattern across every commercial ag-tech product surveyed — not a design risk area.
- **Phase 5 (LLM Recommendation Text):** Straightforward API integration with a hard schema boundary; well-understood pattern.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | Web-search cross-checked across 2-3 sources per claim; no Context7/official-docs provider available in this environment. Version numbers (FastAPI, ultralytics exact minor, Node LTS cutover) should be re-verified against pypi.org/npmjs.com immediately before pinning. |
| Features | MEDIUM | Cross-referenced multiple industry sources (Priva, Fancom, DusunIoT, IoTConnect) and academic reviews; no direct user interviews or single authoritative vendor spec — directional, not gospel. |
| Architecture | MEDIUM (patterns HIGH, citations LOW) | The architectural patterns themselves (strategy pattern, circuit breaker, pipeline-with-quality-gate, decision/dispatch separation) are well-established, high-confidence software engineering practice; individual web-search source citations backing them are low-confidence/illustrative only. |
| Pitfalls | MEDIUM | Cross-checked across multiple independent web sources (smart-farming IoT literature, HITL/automation-bias research, ag-CV occlusion studies, mushroom cultivation guidance); no vendor/official ICS-CERT advisory fetched directly — treat as community/industry consensus, not primary-source guarantee. |

**Overall confidence:** MEDIUM

### Gaps to Address

- **Exact version pins (FastAPI, ultralytics minor, Node LTS window):** Re-verify against pypi.org/npmjs.com/official release pages immediately before locking `package.json`/`requirements.txt` — the research environment lacked a documentation-lookup provider and these ecosystems move fast.
- **Debounce/hysteresis parameters for AI-fallback transitions:** No established default exists in the research (e.g., "N consecutive healthy cycles") — needs to be decided during Phase 4 planning, possibly validated empirically post-launch.
- **Stability/variance alert thresholds for mushroom-specific contamination risk:** PITFALLS.md identifies the *need* for this (Pitfall 5) but not specific numeric thresholds — needs domain-expert input (mycology/cultivation guidance) during Phase 3/6 planning, not purely engineering judgment.
- **Labeling budget/timeline for CV validation datasets:** Flagged as "commonly wrong by 2-5x" — the roadmap should treat this as a scoping risk to validate early in Phase 7 planning rather than assume a fixed timeline.
- **Whether YOLOv8 or YOLO11/YOLO26 should be the actual starting point:** SPEC.md names YOLOv8 specifically; STACK.md notes YOLO11/26 report better speed/accuracy for greenfield projects with no sunk training cost — this is a live phase-level decision point, not resolved by this research.

## Sources

### Primary (HIGH confidence)
- SPEC.md and PROJECT.md (project-internal, repo root and `.planning/PROJECT.md`) — authoritative source for all specific numeric thresholds, retention periods, and safe-state rules referenced throughout the research files.

### Secondary (MEDIUM confidence)
- Releases - timescale/timescaledb (GitHub) — version/compatibility facts
- GitHub - ultralytics/ultralytics + Ultralytics official docs — YOLO model version guidance, ONNX export
- GitHub - nodeshift/opossum — circuit breaker implementation reference
- Node.js/endoflife.date official release pages — LTS timeline facts
- ONNX Runtime official install docs
- Multiple ag-tech vendor sources (Priva, Fancom, DusunIoT, IoTConnect, ControlByWeb) — dashboard/alerting UX conventions
- AGDAILY/Windows Forum farmer-trust survey coverage — AI adoption trust/accuracy findings
- Frontiers, MDPI Sensors, PMC academic reviews — CV crop-monitoring literature, HITL/automation-bias research, sensor drift/failure-detection in smart farming
- Mushroom cultivation guidance (ePlus, Mycopowered, Zombiemyco, Atlas Scientific) — temperature/humidity stage-dependent cultivation requirements

### Tertiary (LOW confidence)
- Various Medium/DEV Community blog posts on YOLOv8+FastAPI microservice patterns, circuit breaker tutorials, IoT real-time pipeline examples — used as illustrative pattern references only, not authoritative; underlying patterns cross-checked as high-confidence general software engineering practice despite individual citation quality.
- General HVAC short-cycling/dual-controller-conflict field guidance — structurally analogous to actuator-hunting risk but not greenhouse-IoT-specific; treated as a useful analogy, not a direct source.

---
*Research completed: 2026-08-18*
*Ready for roadmap: yes*
