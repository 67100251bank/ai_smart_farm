# AI Smart Mushroom Farm

## What This Is

An AI-assisted environmental control system for a mushroom greenhouse (โรงเพาะเห็ด). It reads temperature and humidity sensors in real time, uses AI to analyze trends and recommend adjustments, automatically drives actuators (cooling fan, humidifier, exhaust ventilation), and uses a camera + computer vision pipeline to track mushroom growth (size, count, coverage, color, stage, harvest readiness, anomalies/disease).

## Core Value

Keep the greenhouse's temperature and humidity within safe growing ranges — automatically when possible, safely degraded when sensors/AI/actuators fail — so mushroom yield and quality are not lost to preventable environmental drift.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] System reads temperature via sensor (SHT31-D) at fixed interval, validates range/rate-of-change, and stores time-series history
- [ ] Dashboard displays current temperature with a bounded update-latency SLA and online/stale/offline connection status
- [ ] AI detects temperature patterns (trend, oscillation, daily-cycle anomaly) with a measurable recall target against labeled data
- [ ] AI forecasts temperature 1h and 6h ahead with a measurable error target (MAE)
- [ ] AI recommends temperature adjustments as a structured action + reason + confidence; low-confidence output never auto-applies
- [ ] System commands cooling/fan actuators with ack/timeout/retry, manual-override priority, and command rate-limiting
- [ ] System alerts on abnormal temperature via a defined channel with threshold + cooldown/dedup
- [ ] System reads humidity via sensor at fixed interval with the same validation rules as temperature
- [ ] Dashboard displays current humidity; history is stored with defined retention
- [ ] User (operator/admin role) can set a target humidity range per greenhouse zone, with input validation
- [ ] System automatically controls humidifier and exhaust ventilation to hit humidity targets
- [ ] Temperature-control and humidity-control actuator commands are arbitrated by a defined priority rule when they conflict on shared/overlapping devices
- [ ] System alerts on abnormal humidity via the same channel/cooldown mechanism as temperature
- [ ] Camera captures greenhouse images on a fixed schedule under fixed lighting/angle conditions
- [ ] CV pipeline (YOLOv8) measures mushroom size, count, and coverage area — each with a defined unit and accuracy target against a labeled validation set
- [ ] System detects camera failure / low-quality images and skips analysis for that cycle with alerting
- [ ] System falls back to a rule-based (non-AI) controller when the AI service is unreachable or errors, so physical control never depends solely on AI uptime
- [ ] Unresponsive actuators (ack timeout after retries) enter a predefined per-device safe state (fail-open for ventilation, fail-closed for fan/humidifier) and require operator acknowledgment before auto-control resumes
- [ ] All control-command and sensor-ingest API endpoints require authentication; actuator control commands are restricted to operator/admin roles
- [ ] Sensors and camera devices authenticate with a signed/unique device identity to prevent spoofed-data attacks on control logic

### Out of Scope

- Multi-greenhouse / multi-tenant deployment — single-greenhouse only for this milestone; revisit if a second site is added
- Mobile native app — web dashboard only for v1
- LLM-driven numeric control decisions — an LLM may phrase human-readable recommendation text, but forecast/recommendation numbers come from the rule/ML layer, not the LLM, to avoid hallucinated control values
- CV growth-stage classification (pin/young/mature/overmature), harvest-readiness signal, color classification, and disease/anomaly detection (mold/rot/stunted/discoloration) — moved to v2; this milestone ships CV size/count/coverage-area measurement only, since 4-stage + per-class disease classification needs a labeling effort (≥100 images/class × 4 classes) too large for this milestone's timeline

## Context

- Source spec: `SPEC.md` at repo root — originally a rough Thai-language brief (temperature control, humidity control, camera-based growth monitoring), then hardened through an ambiguity/edge-case/security audit (numeric thresholds, retention periods, fallback behavior, actuator safe-states, auth requirements added).
- Repo already exists and is pushed to GitHub: `https://github.com/67100251bank/ai_smart_farm` (private), with `sudajaikaew` invited as a write collaborator.
- Domain: mushroom cultivation is sensitive to both overheating/overcooling and excess/insufficient humidity — safe-state defaults differ per actuator type (ventilation fails open for gas exchange, fan/humidifier fail closed to avoid runaway heating/mold).
- CV requirements (size, count, stage, harvest-readiness, disease) are inherently subjective without a labeled dataset and domain-expert-defined rubrics — SPEC.md now requires a labeled validation set per metric before any of these are considered "done."

## Constraints

- **Tech stack**: Backend/orchestrator is Node.js + Express; ML/CV workloads run as internal Python microservices (not public-facing) reached via internal REST — Why: Express handles auth/business-logic/arbitration well, but time-series forecasting and CV models are better served by Python's ML ecosystem.
- **Sensors**: SHT31-D (I2C, ±0.3°C / ±2% RH) behind a microcontroller with a unique burned-in device ID — Why: combined temp+humidity sensor simplifies wiring and gives a single device-auth story for both A and B subsystems.
- **Safety**: Actuator control must never depend solely on AI/network availability — a rule-based fallback and per-device safe-state table are required — Why: this is a physical control system; a stuck actuator or AI outage should not be able to overheat/overcool/over-humidify the greenhouse unattended.
- **Security**: All control/ingest endpoints require auth; devices must authenticate; TLS required; command rate-limiting required — Why: sensor spoofing or unrate-limited actuator commands can cause physical damage or unsafe environmental swings.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Split "AI Service" into 3 components: forecast/pattern engine, LLM recommendation-text generator, CV pipeline (YOLOv8 + classifiers) | LLMs are unreliable for numeric time-series forecasting and must not compute control values directly; CV needs detection + classification, not one generic model | — Pending |
| Fail-closed for cooling fan & humidifier, fail-open for exhaust ventilation, on actuator unresponsiveness | Domain safety: no airflow is worse than a bit too much; a stuck-on fan/humidifier is worse than a stuck-off one | — Pending |
| Rule-based fallback controller runs independently of the AI service | AI/network downtime must not remove physical environmental control | — Pending |
| Single-greenhouse scope for this milestone | Keeps initial build focused; multi-tenant adds auth/isolation complexity not yet justified | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-08-27 — cut Phase 5 CV scope to MVP (size/count/coverage only; stage/harvest-readiness/disease deferred to v2)*
