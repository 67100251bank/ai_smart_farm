# Architecture Research

**Domain:** AI-assisted IoT environmental control (greenhouse/agri-tech) with computer vision
**Researched:** 2026-08-18
**Confidence:** MEDIUM (architecture patterns are HIGH-confidence, well-established software engineering practice — circuit breaker, strategy pattern, time-series ingestion; specific tool citations from web search are LOW-confidence and should be treated as illustrative, not authoritative)

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│  DEVICE LAYER                                                            │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐                 │
│  │ ESP32 +      │   │ Actuators    │   │ Camera        │                 │
│  │ SHT31-D      │   │ (fan, humid- │   │ (fixed light/ │                 │
│  │ (device-auth │   │ ifier, vent) │   │ angle, device-│                 │
│  │  signed data)│   │ ack/relay    │   │ auth)         │                 │
│  └──────┬───────┘   └──────▲───────┘   └──────┬────────┘                 │
├─────────┼───────────────────┼──────────────────┼──────────────────────────┤
│         │ sensor readings   │ commands          │ images                 │
│         ▼                   │                   ▼                        │
│  BACKEND / ORCHESTRATOR (Node.js + Express) — single deployable process   │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ Ingest API   → Validation → Time-series Store → Event Bus → WS Push│  │
│  ├────────────────────────────────────────────────────────────────────┤  │
│  │ Control Orchestrator (per-zone, per-actuator)                       │  │
│  │   ControlDecisionStrategy interface                                 │  │
│  │     ├─ AIControlStrategy   (calls Forecast/Pattern svc)             │  │
│  │     └─ RuleBasedStrategy   (threshold on/off, always available)     │  │
│  │   → single ActuatorCommandService (ack/timeout/retry/rate-limit/    │  │
│  │     manual-override lock/arbitration/safe-state) — ONE code path    │  │
│  ├────────────────────────────────────────────────────────────────────┤  │
│  │ Camera Pipeline Coordinator: capture trigger → quality gate →       │  │
│  │   CV service call (circuit-breaker wrapped) → result store          │  │
│  ├────────────────────────────────────────────────────────────────────┤  │
│  │ Auth/RBAC, Alerting/Notification, Audit Log, Manual-override API,  │  │
│  │ Recommendation-text orchestration (rule/forecast numbers + LLM text)│  │
│  └───────────────┬───────────────────────────┬────────────────────────┘  │
│                  │ internal REST (circuit-    │ internal REST (circuit-   │
│                  │ breaker, short timeout)    │ breaker, short timeout)   │
├──────────────────┼─────────────────────────────┼──────────────────────────┤
│  AI/ML SERVICE LAYER (internal-only, not public-facing)                   │
│  ┌───────────────────────────┐   ┌────────────────────────────────────┐   │
│  │ Forecast/Pattern Engine    │   │ CV Pipeline (Python)               │   │
│  │ (Python, Prophet/LSTM)     │   │  YOLOv8 detection + stage/disease  │   │
│  │  - pattern detect (A4)     │   │  classifier                        │   │
│  │  - forecast (A5)           │   │  - size/count/coverage/color/stage │   │
│  │  - feeds recommendation    │   │  - harvest-readiness/anomaly       │   │
│  │    numbers (A6)            │   │                                    │   │
│  └───────────────┬───────────┘   └────────────────────────────────────┘   │
│                  │ (numbers/labels only, never control commands)          │
│                  ▼                                                        │
│  ┌───────────────────────────┐                                            │
│  │ LLM Recommendation-Text    │  (Claude API — phrasing only, no numbers) │
│  │ Generator                  │                                            │
│  └───────────────────────────┘                                            │
├─────────────────────────────────────────────────────────────────────────┤
│  DATA LAYER                                                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │ Time-series  │  │ Relational   │  │ Object/blob  │  │ Audit/event    │ │
│  │ store        │  │ store (users,│  │ store        │  │ log            │ │
│  │ (sensor data)│  │ zones, config│  │ (images)     │  │ (arbitration,  │ │
│  │              │  │ , alerts)    │  │              │  │ safe-state)    │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └───────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Device firmware (ESP32) | Read SHT31-D over I2C, sign/attach device ID, push over HTTPS/MQTT at fixed interval | C/Arduino or MicroPython, TLS client cert or HMAC-signed payload |
| Ingest API | Auth device, range/rate-of-change validate, tag status, persist raw | Express route + validation middleware, writes to time-series store |
| Event bus / pub-sub | Decouple ingestion from real-time push so slow dashboard clients never block writes | In-process EventEmitter (single instance) or Redis pub/sub (multi-instance) |
| WebSocket gateway | Push validated readings + status to connected dashboards within SLA | `ws`/Socket.IO server subscribing to event bus |
| Time-series store | Durable raw (90d) + hourly aggregate (2y) history | TimescaleDB (Postgres-based; relational joins with users/zones for free) or InfluxDB |
| Control Orchestrator | Decide actuator target state each cycle, delegate to strategy, never talks to hardware directly | Node service holding `ControlDecisionStrategy[]` + zone state machine |
| AIControlStrategy | Calls Forecast/Pattern engine + confidence gate, produces same `{action, target, reason}` shape as rule strategy | Wrapped in circuit breaker (opossum), short timeout (3-5s) |
| RuleBasedStrategy | Pure threshold on/off logic (A8/B8 thresholds), zero external dependency, always executable | Plain function, no network calls, no timeout risk |
| ActuatorCommandService | Single choke point for command_id, ack wait, retry, rate-limit, manual-override lock, arbitration, safe-state transition | Shared module called by both strategies' output — never duplicated |
| Forecast/Pattern Engine | Time-series trend/oscillation/cycle detection + 1h/6h forecast | Python microservice (Prophet or small LSTM), internal REST, JSON error contract |
| CV Pipeline | Detection (count/size/coverage) + classification (stage/disease) | Python microservice, YOLOv8 + separate classifier heads, internal REST |
| LLM Recommendation-Text Generator | Turn structured numbers into human-readable explanation only | Claude API call, receives already-computed action/target/confidence as input, never asked to produce numbers |
| Camera Pipeline Coordinator | Trigger capture, run quality gate, call CV service, handle offline/quality-fail cycles | Scheduled job (cron/interval) in Node backend |
| Alerting/Notification | Threshold breach, cooldown/dedup, escalation, fallback-mode notice | Node service, push + email adapters |
| Audit log | Every arbitration decision, safe-state entry/exit, manual override, ack timeout | Append-only table, queried for compliance/debugging |

## Recommended Project Structure

```
backend/                       # Node.js + Express orchestrator
├── src/
│   ├── ingest/                 # sensor/camera ingest endpoints + validation
│   │   ├── validators.ts       # range + rate-of-change checks (shared A1/B1 rule)
│   │   └── ingestController.ts
│   ├── control/
│   │   ├── strategies/
│   │   │   ├── ControlDecisionStrategy.ts   # shared interface
│   │   │   ├── aiControlStrategy.ts         # calls forecast svc, confidence gate
│   │   │   └── ruleBasedStrategy.ts         # pure threshold logic, no deps
│   │   ├── actuatorCommandService.ts        # ack/retry/rate-limit/override/safe-state
│   │   ├── arbitration.ts                   # A7/B7 conflict resolution
│   │   └── controlOrchestrator.ts           # per-zone tick loop, picks strategy
│   ├── camera/
│   │   ├── captureScheduler.ts
│   │   ├── qualityGate.ts       # brightness/blur check before CV call
│   │   └── cvClient.ts          # circuit-breaker wrapped CV service client
│   ├── ai-clients/
│   │   ├── forecastClient.ts    # circuit-breaker wrapped, timeout, JSON contract
│   │   ├── llmClient.ts         # recommendation text only
│   │   └── circuitBreaker.ts    # shared opossum config/factory
│   ├── realtime/
│   │   ├── eventBus.ts
│   │   └── wsGateway.ts
│   ├── alerts/
│   ├── auth/                    # device auth + user RBAC
│   ├── db/                      # time-series + relational repositories
│   └── audit/
├── config/                     # thresholds, intervals, retention — externalized, expert-tunable
└── tests/

cv-service/                     # Python microservice (internal only)
├── app/
│   ├── main.py                 # FastAPI app
│   ├── detection.py            # YOLOv8 wrapper (count/size/coverage)
│   ├── classification.py       # stage + disease/anomaly classifier
│   └── schemas.py              # strict request/response contracts
└── models/

forecast-service/               # Python microservice (internal only)
├── app/
│   ├── main.py
│   ├── pattern_detect.py
│   ├── forecast.py
│   └── schemas.py
```

### Structure Rationale

- **`control/strategies/`:** Isolates the one thing that must never leak into duplicated code — actuator-commanding. Both strategies emit the identical decision shape; only `actuatorCommandService.ts` touches hardware.
- **`ai-clients/`:** All outbound calls to Python services and the LLM live behind one circuit-breaker factory so timeout/fallback behavior is configured once, consistently, and cannot accidentally block the control tick.
- **Two separate Python services (`cv-service/`, `forecast-service/`):** Different resource profiles (CV is CPU/GPU + memory heavy for image inference; forecasting is lightweight and latency-sensitive) and different failure/scaling characteristics — keeping them separate lets CV Docker images with heavy ML deps be rebuilt/scaled independently from the always-on forecast service that the control loop depends on more tightly.
- **`config/`:** SPEC.md explicitly flags all thresholds/intervals/retention as placeholder values pending expert review — externalizing them avoids code changes when domain experts tune numbers.

## Architectural Patterns

### Pattern 1: Strategy Pattern for AI vs Rule-Based Control (addresses question 1)

**What:** Define one `ControlDecisionStrategy` interface — e.g. `decide(zoneState, sensorReading): {action, targetValue, reason, confidence, source}`. `AIControlStrategy` and `RuleBasedStrategy` both implement it. The `ControlOrchestrator` calls whichever strategy is currently active (or tries AI first, falls back to rule-based on failure) and passes the *identical* returned shape into the single `ActuatorCommandService`. The command service (ack/timeout/retry/rate-limit/manual-override/arbitration/safe-state) has no idea whether the decision came from AI or rules — this is exactly how E3/E6 ("AI down → fallback") is supposed to work without duplicating actuator code.

**When to use:** Any time the same physical action can be triggered by more than one decision source (AI, rules, manual). This is the core pattern for this project's central safety requirement.

**Trade-offs:** Slight upfront design cost (agreeing on the shared decision shape) but eliminates an entire class of bugs where the fallback path drifts from the AI path (e.g., fallback forgetting rate-limiting).

**Example:**
```typescript
interface ControlDecision {
  actuatorId: string;
  action: "on" | "off" | "no_action";
  reason: string;
  confidence: number; // 1.0 for rule-based (deterministic)
  source: "ai" | "rule_based" | "manual";
}

interface ControlDecisionStrategy {
  decide(zone: ZoneState, reading: SensorReading): Promise<ControlDecision>;
}

// Orchestrator picks strategy; command service is strategy-agnostic
class ControlOrchestrator {
  constructor(
    private aiStrategy: ControlDecisionStrategy,
    private ruleStrategy: ControlDecisionStrategy,
    private commandService: ActuatorCommandService,
  ) {}

  async tick(zone: ZoneState, reading: SensorReading) {
    let decision: ControlDecision;
    try {
      decision = await this.aiStrategy.decide(zone, reading); // circuit-breaker wrapped inside
      if (decision.confidence < 0.6) decision = await this.ruleStrategy.decide(zone, reading);
    } catch {
      decision = await this.ruleStrategy.decide(zone, reading); // E3/E6 fallback
    }
    await this.commandService.execute(decision); // same path regardless of source
  }
}
```

### Pattern 2: Circuit Breaker for Node ↔ Python Service Calls (addresses question 3)

**What:** Wrap every outbound call from Express to the Forecast service, the CV service, and the LLM in a circuit breaker (e.g. `opossum`) with a short timeout (SPEC.md already specifies ~5s for the forecast service) and a `.fallback()` that returns a sentinel ("service unavailable") rather than throwing unhandled. When failures exceed a threshold the circuit opens and short-circuits immediately (no network round-trip) until a reset window elapses, then half-opens to test recovery.

**When to use:** Any synchronous call from the control-critical Node process into a Python ML service that is not required for actuator safety. This is what makes E3/E6 detectable and fast (orchestrator doesn't hang, falls back to rule-based within the timeout window, not indefinitely).

**Trade-offs:** Sync REST + circuit breaker is simpler to reason about and debug than a message queue, and fits this project's "must not block core control" requirement, since the control loop treats a broken breaker exactly like a fast error and immediately proceeds to rule-based logic. A message queue (e.g. asking the CV/forecast service to publish results asynchronously) would decouple further but adds infrastructure (broker, consumer, correlation) that this project's core control loop does not need to wait on — the CV pipeline in particular is a good candidate for being fully async/non-blocking regardless of transport, since it never gates actuator control (see Pattern 4).

**Example:**
```typescript
import CircuitBreaker from "opossum";

const forecastOptions = { timeout: 5000, errorThresholdPercentage: 50, resetTimeout: 15000 };
const breaker = new CircuitBreaker(callForecastService, forecastOptions);
breaker.fallback(() => ({ error: "forecast_unavailable" }));

async function getForecastOrFallback(reading: SensorReading) {
  const result = await breaker.fire(reading);
  if (result.error) throw new ForecastUnavailableError(); // triggers rule-based strategy upstream
  return result;
}
```

**Recommendation on transport (REST vs queue vs gRPC):** Use **synchronous internal REST with circuit breaker + timeout** for the Forecast/Pattern engine and LLM recommendation calls (control loop wants an answer within one tick or wants to fall back fast — a queue adds latency and complexity disproportionate to the payload size and call frequency here). Use REST (not a queue) for CV as well, but call it from a scheduling/coordinator path that is decoupled from the sensor/actuator control loop entirely (see Pattern 4) — a queue becomes worth it only if capture volume/instances scale beyond a single-greenhouse deployment (out of scope this milestone) or CV inference time regularly exceeds the 30-minute capture interval. gRPC is not warranted here: no cross-language streaming requirement, and REST+JSON is simpler for a two-service internal topology where debuggability matters more than marginal latency/serialization gains.

### Pattern 3: Pipeline with Quality Gate Before Expensive Inference (addresses question 4)

**What:** Camera pipeline runs as: `capture → quality-check (brightness/blur, cheap, in Node or as a Python util) → inference (YOLOv8 + classifier) → store (image + metadata)`. The quality gate runs *before* the CV service is called, so bad images never reach the ML process (saves compute, avoids polluting the dataset described in C2/C3).

**When to use:** Any pipeline where inference is the expensive/slow step and a cheap pre-filter exists.

**Trade-offs:** Adds one more step to write/maintain, but is required by spec (C3: skip low-quality images, log `image_quality_fail`, alert after 3 consecutive failures) and dramatically reduces wasted GPU/CPU cycles and noisy CV output.

## Data Flow

### Sensor Ingest → Dashboard Flow (addresses question 2)

```
ESP32 (SHT31-D)
    │ HTTPS POST, signed payload, every 10s
    ▼
Ingest API (auth device, parse)
    │
    ▼
Validation (range check -10..60°C / 0..100%RH, rate-of-change check)
    │  valid ──────────────┐          flagged/anomalous ─────┐
    ▼                      │                                 ▼
Time-series Store          │                        Time-series Store
(status=valid)              │                        (status=flagged, NOT
    │                       │                         used as control input
    ▼                       │                         until confirmed E2)
Event Bus (publish reading) │
    │                       │
    ▼                       ▼
WebSocket Gateway ──────────┘
    │ push within ≤5s SLA
    ▼
Dashboard (live value + last-updated + online/stale/offline)
```
The control loop and the dashboard push both subscribe to the *validated* reading stream from the event bus — they are two independent consumers of the same ingest pipeline, so a slow dashboard client can never delay actuator decisions, and control-loop cadence is not tied to WebSocket delivery.

### Camera/CV Flow (addresses question 4)

```
Capture Scheduler (every 30 min, configurable)
    │
    ▼
Quality Gate (brightness/blur score)
    │  pass ───────────────────┐        fail ─────────────┐
    ▼                          │                          ▼
CV Service call                │                  log image_quality_fail,
(circuit-breaker, timeout)     │                  skip cycle, alert after
    │  success ──┐   failure ──┼──► use last valid       3 consecutive
    ▼            │             │    result on dashboard
Store result     │             │
(metadata: size,│             │
count, stage,   │             │
disease, conf.) │             │
    ▼            │
Image blob store │ (original image, 30d retention; metadata 2y)
                  ▼
          per-zone access control (C4)
```
Critically: **the CV pipeline never feeds the actuator control loop directly.** It informs the dashboard and (optionally) longer-horizon recommendations/alerts about growth/harvest/disease — it has no path to fan/humidifier/ventilation commands, so a CV outage or slow inference cannot degrade environmental safety control. This is a deliberate boundary: sensor-driven control (temperature/humidity) and CV-driven insight (growth monitoring) are independent subsystems that only share the actuator-command surface through arbitration logic that CV never touches.

### Per-Device Safe-State / Arbitration Placement (addresses question 4b)

Safe-state and arbitration logic must live **inside `ActuatorCommandService`**, not in either control strategy, and not duplicated at the device layer:
- **Ack/timeout/retry tracking** — per actuator, inside the command service, because it must apply identically regardless of who requested the command (AI, rule-based, manual).
- **Safe-state table (fail-open ventilation / fail-closed fan+humidifier)** — a static per-actuator-type config the command service consults the moment retries are exhausted (E5) or stale-data freeze expires (E1). This must not live in either strategy, or the fallback path could re-implement it inconsistently.
- **Arbitration (B7: conflicting temp vs humidity commands on a shared device)** — a dedicated `arbitration.ts` module invoked by the command service *before* dispatch, comparing normalized % deviation from safe range across the requests that target the same physical device. This sits structurally between "decision" and "dispatch": strategies (AI or rule-based) each produce their independent zone-level decisions; arbitration reconciles them into one physical command per device; the command service then applies ack/retry/safe-state to that single reconciled command.
- **Manual-override lock** — also in the command service: a 15-minute lock keyed by actuator, checked before accepting any AI/rule-based command, regardless of source.

This single choke point is what prevents "duplicated actuator-commanding code" between the AI path and the rule-based path — architecturally, AI and rules only ever produce *decisions*; only one component ever produces *actuator commands*.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Single greenhouse, current milestone | Monolithic Express backend + 2 Python microservices is entirely sufficient. In-process EventEmitter is fine for the event bus (single Node instance, no need for Redis pub/sub yet). SQLite/Postgres+Timescale extension in one instance. |
| Multiple greenhouses / zones (future) | Move event bus to Redis pub/sub so multiple Node instances share real-time state; partition time-series data by zone; CV/forecast services already stateless and horizontally scalable behind a load balancer. |
| High camera/CV volume (many cameras, frequent capture) | CV service becomes the first bottleneck (GPU/CPU bound) — worth moving capture→CV handoff to a queue (e.g., BullMQ/Redis or a lightweight job queue) so bursts don't pile up as synchronous HTTP calls; forecast/control path is unaffected since it's already architecturally separate. |

### Scaling Priorities

1. **First bottleneck:** CV inference throughput if capture frequency increases or multiple greenhouses share one CV service — mitigate by queueing capture jobs and scaling CV service replicas independently; this does not touch the sensor/actuator control path at all given the architectural separation already recommended.
2. **Second bottleneck:** WebSocket fan-out if dashboard viewer count grows — mitigate with Redis pub/sub across Node instances; irrelevant to control-loop correctness since control reads from the validated-reading store, not from WebSocket delivery.

## Anti-Patterns

### Anti-Pattern 1: Actuator-Commanding Logic Duplicated in AI and Fallback Paths

**What people do:** Implement the rule-based fallback controller as a separate code path that re-implements ack/retry/rate-limit/safe-state itself "for simplicity," because it feels like a quick emergency patch.
**Why it's wrong:** Any safety property fixed in one path (e.g., rate-limiting to protect relay hardware) silently doesn't apply in the other path. This is exactly the kind of drift that causes physical damage or unsafe states in a system whose entire premise is "AI down must not compromise safety."
**Do this instead:** Both AI and rule-based strategies emit the same `ControlDecision` shape and hand off to one shared `ActuatorCommandService` (Pattern 1). Test the command service once; strategies only need testing for their decision logic.

### Anti-Pattern 2: Letting AI/CV Service Latency Block the Sensor Ingest or Control Tick

**What people do:** Call the forecast/CV service synchronously inline in the same request/tick that also handles sensor validation and actuator dispatch, with no timeout or circuit breaker — "it'll usually respond fast."
**Why it's wrong:** A hung or slow AI/CV call directly delays or blocks physical control decisions, defeating the entire purpose of the fallback requirement (E3/E6) and violating the ≤5s dashboard SLA.
**Do this instead:** Wrap every AI/ML/LLM call in a circuit breaker with an explicit timeout (Pattern 2); the control tick proceeds to the rule-based strategy the moment the breaker trips or times out, never waiting indefinitely.

### Anti-Pattern 3: Feeding LLM-Generated Numbers into Control Logic

**What people do:** Ask the LLM to "explain and recommend" in one shot, then parse a suggested numeric setpoint out of its prose.
**Why it's wrong:** LLMs can hallucinate plausible-looking numbers; feeding them into physical control creates an unverifiable, non-reproducible safety path (SPEC.md explicitly forbids this in A6/Tech Stack).
**Do this instead:** Compute `target_temp`/`action`/`confidence` deterministically from the forecast/rule engine; pass those already-computed values to the LLM purely to generate the human-readable `reason` string, never the reverse.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| LLM API (e.g. Claude API) | Sync REST call, receives structured decision as input, returns natural-language text only | Secrets in env/secret manager only; never exposed to client; failure here should degrade to a canned template string, not block the underlying recommendation (numbers already computed) |
| Push/email notification providers | Async fire-and-forget from Alerting module | Cooldown/dedup logic lives in the alerting module, not in each alert source |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Express backend ↔ Forecast/Pattern service | Internal REST, JSON, circuit breaker, ~5s timeout | Must return parseable JSON error on failure per SPEC.md; never exposed publicly |
| Express backend ↔ CV service | Internal REST, JSON, circuit breaker | Fully decoupled from actuator control; failures only affect dashboard/CV data freshness |
| Control strategies ↔ ActuatorCommandService | In-process function call, shared TypeScript interface | This is the boundary that must never be duplicated (Pattern 1) |
| Device (ESP32/camera) ↔ Ingest API | HTTPS, signed/device-keyed payload | Device authentication prevents spoofed sensor data influencing control (Security §3) |
| Manual override API ↔ ActuatorCommandService | Direct call, highest priority, sets 15-min lock | Must be checked by command service before accepting any AI/rule-based command |

## Suggested Build Order (dependency-driven)

1. **Data layer + device auth + ingest + validation** — nothing else can be built or tested without real/simulated sensor data flowing in and being validated (A1/B1, E1/E2, Security §3/§4). This unblocks everything downstream.
2. **Time-series store + WebSocket dashboard push** — validates the ingest → store → real-time flow end-to-end (A2/A3, B2/B3) and gives a visible system early, independent of any AI component.
3. **Rule-based fallback controller + ActuatorCommandService (ack/retry/rate-limit/manual-override/safe-state/arbitration)** — build this *before* the AI control strategy. It is the safety baseline (E3/E5/E6, Safe-State Table) and defines the shared `ControlDecision`/command interface that the AI strategy will later plug into. Building rule-based first also means the system is deployable and safe even before any ML model exists.
4. **Forecast/Pattern engine microservice + AIControlStrategy + circuit breaker wiring** — now pluggable behind the same interface established in step 3; this is the point where A4/A5/A6 land, along with the confidence-gate (E4) and fallback-on-failure behavior (E3/E6).
5. **LLM recommendation-text generator** — trivial to add once step 4 produces structured decisions; purely additive, no control-path risk.
6. **Alerting/notification layer** — can be built in parallel with steps 2-5 once thresholds and cooldown rules are defined (A8/B8); depends on ingest (step 1) and control state (step 3) for its triggers.
7. **Camera capture + quality gate + CV microservice + storage** — architecturally independent of the temp/humidity control path (Pattern 3/4), so it can be built in parallel with steps 3-6 once basic auth/storage (step 1) exists; should still land after the control safety baseline (step 3) is proven, since CV is lower risk and non-blocking by design.
8. **Access control refinement, audit log completeness, escalation logic** — hardening pass across all subsystems once the core flows in 1-7 are functioning; naturally last because it depends on all prior components existing to audit/restrict.

**Key ordering rationale:** the rule-based controller and shared command interface (step 3) must exist *before* the AI control strategy (step 4) — not after, and not as a "fallback bolted on later." Building AI-first and retrofitting a fallback tends to produce exactly the duplicated/divergent actuator logic described in Anti-Pattern 1. The CV pipeline (step 7) is the most parallelizable/deferrable component because the architecture deliberately keeps it out of the safety-critical path.

## Sources

- [Node.js Resiliency Concepts: The Circuit Breaker — AppSignal Blog](https://blog.appsignal.com/2020/07/22/nodejs-resiliency-concepts-the-circuit-breaker.html) — LOW confidence (web search, general pattern description, not project-specific)
- [Fail fast with Opossum circuit breaker in Node.js — Red Hat Developer](https://developers.redhat.com/blog/2021/04/15/fail-fast-with-opossum-circuit-breaker-in-node-js) — LOW confidence
- [Node.js Circuit Breaker Pattern in Production: Opossum, Fallbacks, and Resilience Engineering — DEV Community](https://dev.to/axiom_agent/nodejs-circuit-breaker-pattern-in-production-opossum-fallbacks-and-resilience-engineering-1mj4) — LOW confidence
- [Model-View-Controller Device Software Design Pattern — IoT Atlas](https://iotatlas.net/en/patterns/mvc/) — LOW confidence, general IoT design pattern reference
- [Building a Real-Time IoT Analytics Pipeline: Key Concepts and Tools — Timescale/Medium](https://medium.com/timescale/building-a-real-time-iot-analytics-pipeline-key-concepts-and-tools-3756cd093724) — LOW confidence
- [InfluxDB vs TimescaleDB: Choosing a Time-Series Database for IoT — LavaPi](https://www.lavapi.com/blog/influxdb-vs-timescaledb-iot-sensor-data) — LOW confidence
- [From Wearable to Web: A Real-Time Data Pipeline with IoT, MQTT, and Node.js](https://www.wellally.tech/blog/real-time-iot-pipeline-esp32-nodejs) — LOW confidence
- [Building a Scalable Microservice for Object Detection with YOLOv8, FastAPI and Docker — Medium](https://medium.com/@anilpankaj3/building-a-scalable-microservice-for-object-detection-with-yolov8-a320b1436da6) — LOW confidence
- [GitHub - Alex-Lekov/yolov8-fastapi: Object Detection Service Template](https://github.com/Alex-Lekov/yolov8-fastapi) — LOW confidence, illustrative reference implementation
- Underlying architectural patterns (circuit breaker, strategy pattern, pipeline-with-quality-gate, separation of decision-from-dispatch) are well-established general software engineering practice cross-checked across multiple independent sources above — treated as HIGH confidence for the *pattern itself*, even though individual source citations are LOW confidence per the classify-confidence tool (unverified web search, no curated/official-docs provider available in this environment).
- SPEC.md and PROJECT.md (`/mnt/c/Users/User/Downloads/spec_workshop/SPEC.md`, `/mnt/c/Users/User/Downloads/spec_workshop/.planning/PROJECT.md`) — project-authoritative source for all specific numeric thresholds, retention periods, and safe-state rules referenced throughout this document.

---
*Architecture research for: AI-assisted IoT greenhouse environmental control + computer vision*
*Researched: 2026-08-18*
