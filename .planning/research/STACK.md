# Stack Research

**Domain:** IoT environmental control + AI/CV greenhouse monitoring (mushroom cultivation)
**Researched:** 2026-08-18
**Confidence:** MEDIUM overall (web-search cross-checked; no official-docs/context7 source available in this environment — treat version numbers as verify-before-lock-in)

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | 22.x LTS (Active LTS through 2026; 24.x is the newer Active LTS if you want fresher) | Backend runtime | Already mandated by SPEC.md. Node 22 is the safer "Active LTS" pin for a physical-control system — avoid Current/odd releases (26.x) which are not LTS until Oct 2026 and aren't yet proven for production control loops. |
| Express | 5.2.x | HTTP API / orchestrator | SPEC.md mandates Express. Express 5 (not legacy 4) is now the Technical Committee's actively endorsed line — Express 4 is on its final few updates. Built-in async error handling in v5 matters here: unhandled promise rejections in actuator-command routes must not crash the process that owns physical control. |
| PostgreSQL + **TimescaleDB** extension | Postgres 16.x or 17.2+ (avoid 17.1 — reverted ABI break), TimescaleDB 2.23+ | Primary datastore: sensor time-series + relational data (users, zones, devices, roles, CV metadata) | One database for both relational (auth, zones, RBAC, device registry) and time-series (10s-interval sensor readings) needs. TimescaleDB gives 10-20x the write/query performance of vanilla Postgres for time-series while keeping full SQL joins — critical because your queries constantly join sensor readings to zone/device/role tables (per-zone humidity targets, per-zone image access control). Native `continuous aggregates` + `add_retention_policy()` map directly onto the spec's 90-day raw / 2-year hourly-aggregate requirement (A3/B3) without hand-rolled cron jobs. |
| Python | 3.12.x | Runtime for AI microservices (forecast engine, CV pipeline) | 3.12/3.13 is the current safe default for new FastAPI/ONNX/Ultralytics projects — best combination of library support (Ultralytics, onnxruntime, Prophet all support 3.12) and performance improvements over 3.10/3.11. |
| FastAPI | 0.12x latest (pin exact minor at build time — moving fast, verify against `pypi.org/project/fastapi` before install) | Internal REST microservice framework for forecast engine + CV pipeline | SPEC.md's own design already isolates AI work into internal Python microservices. FastAPI is the de facto standard here: async-native (non-blocking while YOLOv8/ONNX inference runs), Pydantic request/response validation (matches the spec's "must return JSON that reliably parses" requirement for A4/A5 timeouts), auto-generated OpenAPI docs helpful for the Node↔Python internal contract. |
| Ultralytics YOLOv8 | latest `ultralytics` package (8.3.x line) | Mushroom detection: count, bounding boxes for size/coverage/color extraction | SPEC.md explicitly names YOLOv8 — keep it. Note Ultralytics has since shipped YOLO11 (2024) and YOLO26 (2026) which are faster/more accurate and export to ONNX with reported ~40%+ speed gains; if starting greenfield, evaluate YOLO11 as a drop-in alternative before training, but do not block on this — YOLOv8 remains fully maintained and well documented. |
| ONNX Runtime | `onnxruntime` (CPU) or `onnxruntime-gpu` (CUDA 12.x) | Serving exported YOLOv8/classifier models for inference | Standard deployment path for Ultralytics models off of raw PyTorch: smaller memory footprint, CPU-optimized kernels, no need for a full PyTorch runtime in the serving container. Export via `model.export(format="onnx")`. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `pg` + `node-postgres` pooling (or Knex/Drizzle ORM) | `pg@8.x`, `drizzle-orm` latest | Node ↔ Postgres/TimescaleDB access | Use raw `pg` + a lightweight query builder (Drizzle recommended over a heavy ORM like Sequelize/TypeORM) — time-series queries with window functions/continuous-aggregate views don't map cleanly onto typical ORM abstractions; you want raw SQL control for A3/A5/C2 queries. |
| `express-rate-limit` | latest 7.x | Actuator command rate limiting (A7: 1 cmd/30s per device) | Apply per-device (keyed by device ID, not just IP) on all `/actuators/:id/command` routes. |
| `helmet` | latest | Security headers | Baseline hardening for every Express API (SPEC security §2 TLS/transport). |
| `jsonwebtoken` or `jose` | latest | User/operator session auth (role: operator/admin) | `jose` is the more actively maintained, ESM-first, spec-compliant choice for new projects in 2025/2026; `jsonwebtoken` is fine if already familiar, both work for RBAC-gated actuator endpoints. |
| Custom HMAC middleware (`crypto` built-in, no extra package needed) | n/a | Device authentication for sensors/camera (SPEC security §3) | Sign `timestamp + device_id + body` with a per-device secret (burned in at provisioning), verify in Express middleware before any ingest/command route runs; reject if timestamp drift > ~30s (replay protection). This is the pragmatic, low-PKI-overhead pattern for a single-greenhouse deployment — see rationale in "Device Authentication" below. |
| `opossum` | latest 8.x | Circuit breaker for Node → Python microservice calls | Wrap every call from Express to the forecast-engine and CV microservices. Configure `timeout` to match spec's "5s timeout" (A5-adjacent) and a `.fallback()` that triggers the rule-based fallback controller (E3/E6) — this is the direct code-level implementation of the spec's mandatory AI-outage fallback requirement. |
| `node-cron` or `bree` | latest | Scheduling (hourly aggregate checks, camera capture triggers, retention housekeeping) | `bree` if you want worker-thread isolation for heavier jobs; `node-cron` is sufficient for simple interval triggers. |
| `zod` | latest 3.x | Runtime input validation | Validate every sensor payload (range/rate-of-change per A1/B1) and every operator-set target (B4: 50-95% RH) at the API boundary before it touches the DB — directly satisfies SPEC security §4. |
| `ultralytics` + `opencv-python-headless` | latest | CV pipeline: detection, image preprocessing, quality checks (brightness/blur) | `opencv-python-headless` (not full `opencv-python`) inside a server container — no GUI dependencies needed, smaller image. |
| `scikit-image` or plain OpenCV Laplacian-variance | latest | Blur/brightness image-quality gate (C3) | Cheap, fast pre-filter before spending YOLO inference time on a bad frame — compute Laplacian variance (blur) + mean pixel intensity (brightness/darkness) and reject before the CV pipeline runs. |
| Prophet (`prophet` PyPI) or a small LSTM (PyTorch/Keras) | latest | Time-series forecast engine (A5) | Prophet is the pragmatic first choice for 1h/6h horizon forecasting with confidence intervals out of the box (native `yhat_lower`/`yhat_upper`) and needs far less data/tuning than an LSTM — appropriate given the spec's modest MAE targets (≤1.5°C/1h, ≤3°C/6h). Reach for an LSTM only if Prophet's accuracy on your validation set falls short. |
| Anthropic/Claude API SDK (`@anthropic-ai/sdk`) | latest | Recommendation text generation only (A6) | Per SPEC.md's explicit constraint: LLM produces natural-language explanation text only; the `action`/`target_temp`/`confidence` fields must come from the rule/forecast layer, never parsed out of LLM output. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Docker Compose | Local/prod orchestration of Node API, Postgres/TimescaleDB, Python forecast service, Python CV service | Each Python microservice gets its own container (per SPEC.md: "internal REST, not public-facing") — put them on an internal Docker network, do not expose ports externally; Express is the only public ingress. |
| `docker-compose` healthchecks + restart policies | Service resilience | Feeds directly into E3/E6 fallback behavior — if a Python container is down, Express's circuit breaker should trip fast rather than hang. |
| ESP-IDF (with Arduino-as-component if needed for I2C sensor libs) | Firmware framework for ESP32 sensor/camera nodes | ESP-IDF is the production-grade choice (OTA, secure boot, flash encryption, better memory control) vs. bare Arduino framework, which is better only for early prototyping. Given this spec's security requirements (signed payloads, device identity, TLS), ESP-IDF's native mbedTLS/secure-boot tooling is directly useful. |
| Postman/Insomnia or `.http` files | Internal API contract testing | Verify Node↔Python JSON contract (timeout/error shape) before wiring into the real control loop. |

## Installation

```bash
# Node/Express backend
npm install express@^5 pg drizzle-orm zod jose helmet express-rate-limit opossum node-cron

# Dev dependencies
npm install -D typescript @types/node @types/express vitest supertest

# Python forecast microservice
pip install fastapi uvicorn[standard] prophet pydantic

# Python CV microservice
pip install fastapi uvicorn[standard] ultralytics onnxruntime opencv-python-headless numpy
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|--------------------------|
| TimescaleDB (Postgres extension) | InfluxDB (2.x/3.x) | If sensor cardinality grows into the hundreds of thousands of distinct tag combinations (multi-site, many device types) and you no longer need relational joins to zones/users — InfluxDB's line protocol and Telegraf agents are purpose-built for that. Not justified for a single-greenhouse deployment with a handful of sensors/zones. |
| Server-Sent Events (SSE) for dashboard push | WebSocket (via Socket.IO) | If you later add true bidirectional low-latency needs (e.g. a live manual "jog" slider for fan speed with instant feedback, or multi-operator live cursors). For simple "push sensor reading / alert / CV result to dashboard" (this spec's A2/B2), SSE is simpler, needs no extra client library, and survives proxies/reverse-proxies better. |
| HMAC-signed payload device auth | mTLS (per-device client certs) | If the deployment grows to many greenhouses/many device types with a formal PKI need, or a compliance regime requires certificate-based identity. For a single-greenhouse deployment (SPEC.md's explicit scope), mTLS's certificate issuance/rotation overhead is not justified. |
| HTTP push (signed, ack-based) for sensor ingest + actuator commands | MQTT (Mosquitto) pub/sub | If you outgrow single-greenhouse into a fleet of many low-power devices where persistent broker connections and QoS-based delivery outweigh the value of per-command HTTP ack semantics. The spec's A7 design (command_id idempotency key, 5s ack timeout, 3 retries) maps naturally onto HTTP request/response; MQTT's pub/sub model would require you to reinvent ack/retry semantics on top of it. If MQTT is still desired for telemetry fan-out, use self-hosted **Mosquitto** (lightweight, single-node, no clustering license needed) — not EMQX, which is overbuilt for one greenhouse and requires a paid license (BSL 1.1) for multi-node clustering you won't need. |
| Prophet for forecasting | Small LSTM (PyTorch) | If Prophet's accuracy doesn't hit the MAE targets on your validation set, or you need to model complex multivariate interactions (temp+humidity+external weather) that Prophet handles less naturally than a custom sequence model. |
| YOLOv8 (Ultralytics) | YOLO11 / YOLO26 (Ultralytics) | If starting model training from scratch with no sunk cost in YOLOv8-trained weights — YOLO11/YOLO26 report better speed/accuracy and are the "recommended starting point for new projects" per Ultralytics' own 2026 guidance. SPEC.md names YOLOv8 specifically, so treat this as a phase-level decision point, not a default override. |
| Express 5 | Express 4 | Only if a critical dependency you need hasn't been updated for Express 5's breaking changes yet — check before committing. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Plain PostgreSQL without TimescaleDB for 10-second-interval sensor data at 90-day+2-year retention | You will hand-roll partitioning, downsampling cron jobs, and compression that TimescaleDB gives natively via hypertables + continuous aggregates + retention policies — significant avoidable engineering effort and a common source of "why is this query slow after 3 months" bugs. | TimescaleDB extension on the same Postgres instance |
| Raw PyTorch model serving (no ONNX) in the CV/forecast microservices | Heavier runtime, larger container images, slower CPU inference, more memory — matters on constrained/on-prem greenhouse hardware without a dedicated GPU. | Export to ONNX, serve via ONNX Runtime |
| Calling the LLM API to compute `target_temp`/`action` values directly | Explicit anti-requirement in SPEC.md (A6, Out of Scope) — LLMs hallucinate numeric control values, which is dangerous in a physical-actuator system (e.g., a hallucinated target could overheat/overcool the greenhouse). | LLM generates explanation text only; rule/forecast engine computes the structured `{action, target_temp, confidence}` |
| MQTT with no ack/idempotency layer for actuator commands | Fire-and-forget pub/sub does not natively satisfy the spec's command_id idempotency + 5s-ack + 3-retry requirement (A7) — you'd have to build a request/reply pattern on top of pub/sub, which is more complex than just using HTTP for this one thing. | HTTP POST with `command_id`, server-side ack tracking, retry/backoff logic in Express |
| EMQX for a single-greenhouse MQTT need (if MQTT is used at all) | Overbuilt for this scale; multi-node clustering (the main reason to pick EMQX over Mosquitto) requires a BSL 1.1 commercial license as of v5.9+. | Self-hosted Mosquitto |
| Bare API keys alone (no signing) for device authentication | Static keys sent in headers/query params are trivially replayable/leakable via logs; does not satisfy "signed payload" requirement in SPEC security §3. | Per-device HMAC-signed payload (key + timestamp + nonce) |
| Sequelize/TypeORM as the primary DB access layer for time-series queries | Heavy ORM abstractions fight you when writing window-function/continuous-aggregate SQL and hypertable-specific functions (`time_bucket`, `add_retention_policy`) — you'll end up writing raw SQL through the ORM's escape hatch anyway. | `pg` + Drizzle (lightweight query builder, first-class raw SQL support) |
| Arduino framework for final production firmware | Weaker OTA/rollback, no secure boot/flash encryption tooling comparable to ESP-IDF — a liability given this spec's device-security requirements and 24/7 unattended physical-control role. | ESP-IDF (prototype in Arduino if faster, port to ESP-IDF before field deployment) |

## Stack Patterns by Variant

**If GPU hardware is available for the CV pipeline (e.g., a Jetson or a server with an NVIDIA GPU):**
- Use `onnxruntime-gpu` (CUDA 12.x) or export to TensorRT for the YOLOv8/classifier models
- Because a 30-minute capture interval (C1) means inference is not latency-critical, but batching multiple recent frames or running the disease-classifier + stage-classifier + detector in sequence benefits from GPU throughput if available; CPU-only ONNX Runtime is entirely adequate otherwise given the low capture frequency.

**If no GPU (typical small on-prem greenhouse deployment):**
- Use `onnxruntime` (CPU), keep model input resolution modest (e.g., 640x640), and rely on the 30-minute capture cadence to make CPU inference latency a non-issue
- Because a single-greenhouse deployment doesn't need real-time video inference — one frame every 30 minutes on CPU ONNX Runtime comfortably finishes in seconds, well within any reasonable SLA.

**If the project later adds multiple greenhouses/sites (explicitly out of scope for this milestone but flagged in PROJECT.md):**
- Revisit MQTT (Mosquitto→EMQX) for device fan-out and consider InfluxDB/ClickHouse for higher-cardinality time-series
- Because the HTTP-ack and single-Postgres-instance patterns recommended here are optimized for one site; they don't automatically break at 2-3 sites, but the calculus shifts meaningfully past that.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| TimescaleDB 2.23+ | PostgreSQL 16.x, 17.2+, 18.x | Avoid PostgreSQL 17.0/17.1 specifically (reverted binary-interface break); TimescaleDB 2.29+ (mid/late 2026) drops PostgreSQL 15 support — pin to 16.x or 17.2+ now to avoid a forced migration soon after launch. |
| Express 5.2.x | Node.js 18+ | Express 5 requires a reasonably modern Node; Node 22 LTS comfortably satisfies this. |
| Ultralytics `ultralytics` package | Python 3.9-3.13 | Use Python 3.12 for the CV microservice; matches FastAPI's recommended 2026 baseline too, letting both Python services share one base Docker image. |
| `onnxruntime-gpu` | CUDA 12.x | Only relevant if a GPU deployment variant is chosen; do not install alongside plain `onnxruntime` in the same environment (pick one). |
| `jose` | Node.js ESM | If your Node codebase is CommonJS, either enable ESM or use `jsonwebtoken` instead to avoid interop friction. |

## Sources

- [MQTT on ESP32: A Beginner's Guide | EMQ](https://www.emqx.com/en/blog/esp32-connects-to-the-free-public-mqtt-broker) — MEDIUM (web, cross-checked with multiple ESP32/MQTT sources)
- [ESP-IDF vs Arduino Framework for ESP32: Pros and Cons - Zbotic](https://zbotic.in/esp-idf-vs-arduino-framework-for-esp32-pros-and-cons/) and [Best ESP32 Firmware Frameworks in 2026 - ZedIoT](https://zediot.com/blog/best-esp32-firmware-frameworks-2026/) — MEDIUM
- [InfluxDB vs PostgreSQL vs TimescaleDB: Database Comparison 2026 - index.dev](https://www.index.dev/skill-vs-skill/database-timescaledb-vs-influxdb-vs-postgresql-time-series), [TimescaleDB vs. InfluxDB | Tiger Data](https://www.tigerdata.com/blog/timescaledb-vs-influxdb-for-time-series-data-timescale-influx-sql-nosql-36489299877) — MEDIUM
- [Data retention with continuous aggregates | Timescale Docs (via GitHub timescale/docs mirror)](https://github.com/timescale/docs/blob/latest/use-timescale/data-retention/data-retention-with-continuous-aggregates.md), [Understanding retention policies on continuous aggregates - TigerData Community Forum](https://forum.tigerdata.com/forum/t/understanding-retention-policies-on-continuous-aggregates/567) — MEDIUM
- [Releases · timescale/timescaledb](https://github.com/timescale/timescaledb/releases) — MEDIUM (version/compat facts, near-primary source)
- [Building a Scalable Microservice for Object Detection with YOLOv8, FastAPI and Docker - Medium](https://medium.com/@anilpankaj3/building-a-scalable-microservice-for-object-detection-with-yolov8-a320b1436da6), [Deploy YoloV8 ONNX - Medium](https://alimustoofaa.medium.com/deploy-yolov8-onnx-1cbc02395a85) — MEDIUM
- [GitHub - ultralytics/ultralytics](https://github.com/ultralytics/ultralytics), [Choosing the right Ultralytics YOLO model](https://www.ultralytics.com/blog/ultralytics-yolo26-vs-yolo11-vs-yolov8-which-one-should-you-use), [ONNX Export for YOLO26 Models | Ultralytics Docs](https://docs.ultralytics.com/integrations/onnx) — MEDIUM-HIGH (official Ultralytics sources)
- [Server-Sent Events: The Underrated Alternative to WebSockets (2026 Guide) - DEV Community](https://dev.to/young_gao/server-sent-events-the-underrated-alternative-to-websockets-for-real-time-notifications-1i1f) — MEDIUM
- [From API Keys to mTLS: Choose the Right Security Shield for Any Endpoint - API7.ai](https://api7.ai/blog/api-security-guide-authentication-mtls-hmac), [Scaling mTLS IoT Security - SocketXP](https://www.socketxp.com/iot/scaling-mtls-iot-security-automated-device-certificates/) — MEDIUM
- [Mosquitto vs EMQX: Features, Scalability, and Use Cases Compared | EMQ](https://www.emqx.com/en/blog/emqx-vs-mosquitto-2023-mqtt-broker-comparison), [Mosquitto vs EMQX — An Honest Comparison for IoT Teams - Cedalo](https://www.cedalo.com/blog/mosquitto-vs-emqx-an-honest-comparison-for-iot-teams) — MEDIUM
- [Node.js Circuit Breaker Pattern in Production: Prevent Cascading Failures with Opossum - DEV Community](https://dev.to/axiom_agent/nodejs-circuit-breaker-pattern-in-production-prevent-cascading-failures-with-opossum-odg), [GitHub - nodeshift/opossum](https://github.com/nodeshift/opossum) — MEDIUM-HIGH (official repo + cross-checked)
- [Node.js — Node.js 26.0.0 (Current)](https://nodejs.org/en/blog/release/v26.0.0), [Node.js | endoflife.date](https://endoflife.date/nodejs) — MEDIUM-HIGH (official/near-primary)
- [HeroDevs Blog | Express 3 is EOL, Express 4 is Next: The 2026 Support Reference](https://www.herodevs.com/blog-posts/express-3-is-eol-express-4-is-next-the-2026-support-reference) — MEDIUM
- [FastAPI Latest Version, Python Requirements & Setup Guide (2026) - zestminds](https://www.zestminds.com/blog/fastapi-requirements-setup-guide-2025/), [fastapi · PyPI](https://pypi.org/project/fastapi/) — MEDIUM (verify exact pinned version at implementation time — release cadence is fast)
- [Install ONNX Runtime | onnxruntime](https://onnxruntime.ai/docs/install/) — MEDIUM-HIGH (official docs)

**Note on confidence:** This research environment did not have access to a documentation-lookup provider (e.g. Context7) or a premium search API — all findings above come from general web search, cross-checked across 2-3 independent sources per claim where possible. Version numbers in particular (FastAPI, ultralytics exact minor, Node LTS cutover dates) should be re-verified against `pypi.org`/`npmjs.com`/official release pages immediately before pinning in `package.json`/`requirements.txt`, since these ecosystems move fast and training/search data can lag by weeks.

---
*Stack research for: IoT + AI/CV greenhouse environmental control system*
*Researched: 2026-08-18*
