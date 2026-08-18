# Requirements: AI Smart Mushroom Farm

**Defined:** 2026-08-18
**Core Value:** Keep the greenhouse's temperature and humidity within safe growing ranges — automatically when possible, safely degraded when sensors/AI/actuators fail.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases. Derived from `SPEC.md` (hardened spec) plus research-confirmed table-stakes (`.planning/research/FEATURES.md`, `SUMMARY.md`).

### Sensing & Validation (SENS)

- [ ] **SENS-01**: System ingests temperature and humidity readings from the SHT31-D sensor at a fixed interval (10s) via an authenticated device (signed payload + anti-replay nonce/timestamp)
- [ ] **SENS-02**: System validates each reading against a plausible range (-10–60°C, 0–100% RH) and rate-of-change limit, flagging (not discarding) anomalous values
- [ ] **SENS-03**: System stores raw readings (90-day retention) and hourly aggregates (2-year retention) in a queryable time-series store

### Real-Time Dashboard (DASH)

- [ ] **DASH-01**: Operator can view current temperature and humidity on a dashboard that updates within a bounded latency (≤5s) of the sensor reading
- [ ] **DASH-02**: Dashboard shows connection status (online/stale/offline) and last-updated time for each sensor
- [ ] **DASH-03**: Operator can view historical temperature/humidity trend charts over the retained history window

### AI Analysis (AIAN)

- [ ] **AIAN-01**: System detects temperature/humidity patterns (trend, oscillation, daily-cycle anomaly) and labels them with a confidence score, measured against a labeled validation set (≥80% recall target)
- [ ] **AIAN-02**: System forecasts temperature 1h and 6h ahead with a confidence interval, measured against an error target (MAE)
- [ ] **AIAN-03**: System generates a structured recommendation (action, target value, reason, confidence) for temperature/humidity adjustment; recommendations below the confidence threshold (0.6) never auto-apply regardless of mode
- [ ] **AIAN-04**: Recommendation "reason" text is human-readable (may use an LLM for phrasing only) — the LLM never computes the numeric action/target values
- [ ] **AIAN-05**: Operator can enable an opt-in "auto-apply" mode for above-threshold recommendations; default is manual approval

### Actuator Control (CTRL)

- [ ] **CTRL-01**: System commands the cooling fan with an idempotent command protocol (ack within 5s, retry up to 3 times, then enter unresponsive handling)
- [ ] **CTRL-02**: System commands the humidifier and exhaust ventilation with the same ack/retry protocol as CTRL-01
- [ ] **CTRL-03**: Operator manual commands always take priority over AI/rule-engine commands and lock out automated control of that actuator for 15 minutes
- [ ] **CTRL-04**: System rate-limits repeated commands to the same actuator (max 1 per 30s) regardless of which decision source (AI or rule-based) issued them
- [ ] **CTRL-05**: System arbitrates conflicting temperature-control and humidity-control commands on overlapping/shared actuators using a logged, deviation-based priority rule
- [ ] **CTRL-06**: Operator can configure a target humidity range (50-95% RH) per greenhouse zone, with input validation on out-of-range values

### Alerting (ALRT)

- [ ] **ALRT-01**: System alerts operators when temperature or humidity crosses a configurable abnormal threshold, via push notification and email
- [ ] **ALRT-02**: Repeated alerts of the same type are deduplicated with a cooldown (15 min) until the value returns to normal

### Fallback & Safety (FAIL)

- [ ] **FAIL-01**: System falls back to a rule-based (non-AI) controller — reusing the same threshold definitions as ALRT-01 — whenever the AI service is unreachable or errors, so actuator control never depends solely on AI/network uptime
- [ ] **FAIL-02**: System freezes the last actuator command (no new AI/rule commands) during a bounded sensor-data-stale window (≤5 min), then forces the per-device Safe-State (fail-open for ventilation, fail-closed for fan/humidifier) if staleness persists
- [ ] **FAIL-03**: An actuator that fails to ack after retries (CTRL-01/02) enters its predefined Safe-State and requires operator acknowledgment before automated control resumes
- [ ] **FAIL-04**: System detects camera failure or low-quality images (brightness/blur check) and skips that capture cycle's CV analysis, alerting if it persists across multiple cycles

### Computer Vision Growth Monitoring (CV)

- [ ] **CV-01**: System captures greenhouse images on a fixed schedule (30 min default) under fixed lighting/camera-angle conditions
- [ ] **CV-02**: System measures mushroom size (cm, calibrated), count, and coverage area (%) from captured images, each validated against a labeled dataset with a defined accuracy target
- [ ] **CV-03**: System classifies mushroom color and growth stage (pin/young/mature/overmature) from captured images, validated against expert-labeled data
- [ ] **CV-04**: System derives a harvest-readiness signal from stage + size (rule-based on top of CV-02/CV-03 output, not a standalone subjective judgment)
- [ ] **CV-05**: System classifies mushroom anomalies/disease (mold, rot, stunted, discoloration) into predefined classes, validated per-class against a labeled dataset (≥100 images/class)

### Security & Access Control (SEC)

- [ ] **SEC-01**: All sensor-ingest and actuator-control API endpoints require authentication over TLS
- [ ] **SEC-02**: Actuator control commands are restricted to operator/admin roles; view-only access is available to other authenticated users
- [ ] **SEC-03**: Sensors and cameras authenticate with a signed, per-device identity including anti-replay protection (nonce/timestamp) to prevent spoofed or replayed device data/commands

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Alerting & Trust (ALRT)

- **ALRT-03**: Severity-tiered alerts (critical/warning/info) with different channels/interruption levels per tier
- **ALRT-04**: Stability/variance-based alerting (sustained swings within "safe" range) alongside static threshold checks, for mushroom-contamination-risk dynamics
- **ALRT-05**: Additional alert channels (e.g., LINE Notify, SMS)

### AI & CV Refinement

- **AIAN-06**: Species/strain-specific threshold presets (beyond the current per-zone configurable defaults)
- **CV-06**: Predictive yield estimation across full flush cycles, tying CV counts/sizes over time to expected harvest weight

### Farm Management (new layer, not in original SPEC)

- **FARM-01**: Flush-cycle / substrate-batch lifecycle tracking (spawn → colonize → flush → harvest, batch/lot management)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Multi-greenhouse / multi-tenant deployment | Adds auth/isolation complexity not justified until a second site exists; single-greenhouse scope for this milestone |
| Native mobile app | Responsive web dashboard is sufficient for v1; revisit only if on-site connectivity/UX friction is proven in practice |
| LLM computing control numbers directly | Documented hallucination risk for numeric/agronomic values in a physical-safety context — LLM is scoped to explanation text only (AIAN-04), never the decision path |
| Fully unsupervised CV output without a labeled validation set | Growth-stage/harvest-readiness/disease classification are inherently ambiguous without ground truth; every CV metric requires a labeled dataset before being considered done (CV-02–CV-05) |
| Continuous/high-frequency camera capture (sub-minute intervals) | Mushroom growth is a slow biological process; higher frequency multiplies storage/compute/false-alarm surface for no signal gain |
| Fully automated disease-response actions (e.g., auto-remediation) | Disease/anomaly detection (CV-05) only reaches ~80% per-class precision — false positives triggering physical/destructive remediation actions unsupervised is unacceptable; always routes to operator alert |

## Traceability

Which phases cover which requirements. Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SENS-01 | TBD | Pending |
| SENS-02 | TBD | Pending |
| SENS-03 | TBD | Pending |
| DASH-01 | TBD | Pending |
| DASH-02 | TBD | Pending |
| DASH-03 | TBD | Pending |
| AIAN-01 | TBD | Pending |
| AIAN-02 | TBD | Pending |
| AIAN-03 | TBD | Pending |
| AIAN-04 | TBD | Pending |
| AIAN-05 | TBD | Pending |
| CTRL-01 | TBD | Pending |
| CTRL-02 | TBD | Pending |
| CTRL-03 | TBD | Pending |
| CTRL-04 | TBD | Pending |
| CTRL-05 | TBD | Pending |
| CTRL-06 | TBD | Pending |
| ALRT-01 | TBD | Pending |
| ALRT-02 | TBD | Pending |
| FAIL-01 | TBD | Pending |
| FAIL-02 | TBD | Pending |
| FAIL-03 | TBD | Pending |
| FAIL-04 | TBD | Pending |
| CV-01 | TBD | Pending |
| CV-02 | TBD | Pending |
| CV-03 | TBD | Pending |
| CV-04 | TBD | Pending |
| CV-05 | TBD | Pending |
| SEC-01 | TBD | Pending |
| SEC-02 | TBD | Pending |
| SEC-03 | TBD | Pending |

**Coverage:**
- v1 requirements: 31 total
- Mapped to phases: 0 (pending roadmap creation)
- Unmapped: 31 ⚠️ (expected — roadmapper fills this in next)

---
*Requirements defined: 2026-08-18*
*Last updated: 2026-08-18 after initial definition*
