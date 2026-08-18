# Roadmap: AI Smart Mushroom Farm

## Overview

Build a physical-safety-critical greenhouse control system in dependency order: first get sensor data flowing in securely and durably (Phase 1), then make it visible to operators (Phase 2), then give the greenhouse a working, safe, rule-based automatic control loop with manual override, arbitration, alerting, and fail-safes — the non-negotiable safety baseline that must exist before any AI touches an actuator (Phase 3). Only once that baseline is proven does AI plug in as a pluggable, confidence-gated, fail-back-safe decision strategy (Phase 4). Computer-vision-based growth monitoring is architecturally decoupled from the control loop entirely, so it lands last as the lowest-risk, most independently deferrable slice (Phase 5).

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation — Sensing & Device Security** - Authenticated sensor ingest, validation, and durable time-series storage
- [ ] **Phase 2: Real-Time Dashboard & Historical Trends** - Operators see live and historical temp/humidity conditions
- [ ] **Phase 3: Rule-Based Control & Safety Baseline** - Automatic actuator control, manual override, arbitration, alerting, and fail-safes — independent of AI
- [ ] **Phase 4: AI-Assisted Control & Recommendations** - Pattern detection, forecasting, and confidence-gated recommendations plugged into the safety baseline
- [ ] **Phase 5: CV Growth Monitoring** - Camera-based mushroom growth, stage, and anomaly tracking

## Phase Details

### Phase 1: Foundation — Sensing & Device Security
**Goal**: Greenhouse sensor data flows into the system securely, validated, and durably stored, so every later phase (dashboard, control, AI) has trustworthy ground truth to build on.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: SENS-01, SENS-02, SENS-03, SEC-01, SEC-02, SEC-03
**Success Criteria** (what must be TRUE):
  1. Temperature and humidity readings arrive roughly every 10s, and are only accepted from a device presenting a valid signed payload with anti-replay nonce/timestamp — forged or replayed payloads are rejected.
  2. Readings outside the plausible range (-10-60°C, 0-100% RH) or with an abnormal rate-of-change are flagged (not discarded) and still retained.
  3. Raw readings are queryable up to 90 days back; hourly aggregates are queryable up to 2 years back.
  4. All sensor-ingest and control-command API endpoints require authentication over TLS, and actuator-control access is restricted to operator/admin roles (view-only for others).
**Plans**: TBD

### Phase 2: Real-Time Dashboard & Historical Trends
**Goal**: Operators can see current and historical greenhouse conditions at a glance, with trustworthy staleness signaling.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: DASH-01, DASH-02, DASH-03
**Success Criteria** (what must be TRUE):
  1. Operator sees the dashboard reflect a new sensor reading within ≤5 seconds of that reading being captured.
  2. Dashboard shows online/stale/offline connection status and a last-updated time for each sensor.
  3. Operator can view historical temperature/humidity trend charts spanning the retained history window (raw + hourly-aggregate data).
**Plans**: TBD
**UI hint**: yes

### Phase 3: Rule-Based Control & Safety Baseline
**Goal**: The greenhouse's actuators are automatically and safely controlled by a rule-based engine — with manual override priority, cross-system arbitration, threshold alerting, and fail-safe behavior — entirely independent of any AI component, so the system is deployable and safe before any ML model exists.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: CTRL-01, CTRL-02, CTRL-03, CTRL-04, CTRL-05, CTRL-06, FAIL-02, FAIL-03, ALRT-01, ALRT-02
**Success Criteria** (what must be TRUE):
  1. System automatically commands the cooling fan, humidifier, and exhaust ventilation to keep readings within target ranges (including operator-configured per-zone humidity targets), using an idempotent ack/retry (5s ack, 3 retries) protocol with per-actuator rate-limiting (max 1 command/30s).
  2. Operator manual commands always take priority over automated commands and lock out automated control of that actuator for 15 minutes.
  3. Conflicting temperature-control and humidity-control commands on a shared actuator are resolved by a logged, deviation-based priority rule.
  4. Operators are alerted (push + email) when temperature or humidity crosses a configurable abnormal threshold, with repeated alerts of the same type deduplicated via a 15-minute cooldown.
  5. When sensor data goes stale beyond 5 minutes, or an actuator fails to ack after retries, the affected actuator(s) enter their predefined Safe-State (fail-open for ventilation, fail-closed for fan/humidifier) and require operator acknowledgment before automated control resumes.
**Plans**: TBD

### Phase 4: AI-Assisted Control & Recommendations
**Goal**: AI augments the proven rule-based control loop with pattern detection, forecasting, and confidence-gated recommendations — plugging into the existing safety baseline as an interchangeable decision source, never replacing it, and falling back cleanly whenever it is unavailable.
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: AIAN-01, AIAN-02, AIAN-03, AIAN-04, AIAN-05, FAIL-01
**Success Criteria** (what must be TRUE):
  1. System detects temperature/humidity patterns (trend, oscillation, daily-cycle anomaly) with a confidence score, achieving ≥80% recall against a labeled validation set.
  2. System forecasts temperature 1h and 6h ahead with a confidence interval, meeting the defined MAE error targets.
  3. System generates a structured recommendation (action, target value, human-readable reason, confidence) where the reason text may use an LLM for phrasing only — the LLM never computes the numeric action/target — and recommendations below the 0.6 confidence threshold never auto-apply.
  4. Operator can opt into an "auto-apply" mode for above-threshold recommendations; manual approval remains the default.
  5. When the AI service is unreachable or errors, actuator control automatically and transparently falls back to the Phase 3 rule-based controller with no gap in safety coverage.
**Plans**: TBD

### Phase 5: CV Growth Monitoring
**Goal**: Operators can see quantified mushroom growth, health, and harvest-readiness signals derived from scheduled camera captures — a pipeline architecturally decoupled from the actuator control loop so it can never degrade environmental safety.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: CV-01, CV-02, CV-03, CV-04, CV-05, FAIL-04
**Success Criteria** (what must be TRUE):
  1. Camera captures greenhouse images on a fixed schedule (30 min default) under fixed lighting/angle conditions.
  2. System detects camera failure or low-quality images (brightness/blur check) and skips that cycle's CV analysis, alerting if the failure persists across multiple cycles.
  3. System measures mushroom size (cm), count, and coverage area (%) from captured images, each validated against a labeled dataset against a defined accuracy target.
  4. System classifies mushroom color and growth stage (pin/young/mature/overmature), and derives a harvest-readiness signal from stage + size, validated against expert-labeled data.
  5. System classifies mushroom anomalies/disease (mold, rot, stunted, discoloration) into predefined classes, validated per-class against a labeled dataset (≥100 images/class).
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation — Sensing & Device Security | 0/TBD | Not started | - |
| 2. Real-Time Dashboard & Historical Trends | 0/TBD | Not started | - |
| 3. Rule-Based Control & Safety Baseline | 0/TBD | Not started | - |
| 4. AI-Assisted Control & Recommendations | 0/TBD | Not started | - |
| 5. CV Growth Monitoring | 0/TBD | Not started | - |
