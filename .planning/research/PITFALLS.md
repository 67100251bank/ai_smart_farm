# Pitfalls Research

**Domain:** AI-assisted IoT environmental control for a physical mushroom-cultivation greenhouse (sensor ingestion, AI forecasting/recommendation, actuator control, computer-vision crop monitoring)
**Researched:** 2026-08-18
**Confidence:** MEDIUM (cross-checked across multiple independent web sources; no vendor/official ICS-CERT advisory was fetched directly — treat as community/industry consensus, not primary-source guarantee)

This research maps directly onto SPEC.md's existing mechanisms (A1 validation, A4-A6 AI layer, A7/B5-B6 actuator control, B7 arbitration, C1-C4 CV pipeline, Security §1-7, Edge Cases E1-E7, Safe-State Table). Where a pitfall is **already mitigated** in SPEC.md, this file says so explicitly and flags the residual risk that remains even with the mitigation — because "the spec mentions it" and "the implementation actually enforces it" are different things, and roadmap phases need to verify the latter.

---

## Critical Pitfalls

### Pitfall 1: Treating sensor noise/drift as a data-quality afterthought instead of a first-class control input

**What goes wrong:**
Teams build the happy-path sensor→dashboard→actuator pipeline first and bolt on anomaly handling later. In production, cheap I2C sensors (like the spec'd SHT31-D) drift over months due to dust/humidity film on the sensing element, condensation in a high-humidity greenhouse, and thermal gradients between the sensor and the air being measured. A single noisy reading (not a hardware fault, just electrical noise or a brief condensation spike) can look identical to a real environmental event to a naive threshold-based system, triggering an actuator response to a phantom problem. Conversely, slow drift (e.g., the RH sensor reads 3% low after 6 months) doesn't look anomalous at all — the rate-of-change check never fires because drift is, by definition, slow — so the system confidently controls to the wrong setpoint indefinitely.

**Why it happens:**
Drift and noise have different failure signatures — noise is high-frequency/instant (caught by rate-of-change checks like SPEC A1's "5°C/10s"), drift is low-frequency/gradual (invisible to rate-of-change checks, invisible to range checks, and only visible by comparing against an independent reference over time). Most teams only design for the first because it's the one that produces visible incidents early; drift produces a slow, invisible quality decay that shows up as "the mushrooms aren't doing as well as last season" months later with no obvious root cause.

**How to avoid:**
- Keep SPEC A1's rate-of-change + range validation (handles noise) but add a **separate drift-detection mechanism**: periodic cross-check between the two SHT31-D readings if multiple sensors exist per zone, or a scheduled manual reference-instrument spot-check logged against sensor readings, with a drift-alert threshold (e.g., >1°C or >5% RH divergence from reference).
- Track sensor age/calibration date as metadata on every reading (`sensor_id, calibrated_at`) so operators can be prompted for recalibration/replacement on a schedule, not only on failure.
- Do not let "no anomaly flagged" be interpreted as "sensor is accurate" — these are different claims. Anomaly flags catch noise; they do not catch drift.

**Warning signs:**
- Sensor readings never get flagged `anomalous` for months, yet operators report the greenhouse "feels" different from what the dashboard shows.
- Two sensors in the same zone (if present) slowly diverge without either individually triggering rate-of-change or range flags.
- Actuator on/off cycling patterns change gradually over a season with no corresponding change in flagged anomalies.

**Phase to address:**
Sensor ingestion/validation phase (extends A1) — add drift-detection design before CV/AI phases depend on sensor history as ground truth. Revisit at any "sensor hardware refresh" phase.

---

### Pitfall 2: "AI recommends, rule engine/human acts" degrading into either automation bias or a fighting-controllers oscillation

**What goes wrong:**
SPEC A6/E3/E4 already builds the right skeleton (confidence gating, manual override priority, rule-based fallback). The pitfall is in how this plays out in practice, in two opposite failure directions:

1. **Automation bias / alert fatigue**: Once operators see the AI is "usually right," they start rubber-stamping `approve` without reading the reason or checking the confidence score — especially under the A8/B8 15-minute alert cooldown, which trains operators to associate alerts with "normal, already-seen-this" rather than "read this carefully." Documented human-in-the-loop research shows this is a structural consequence of oversight architecture, not an individual failing — the fix has to be in the interface/workflow, not in reminding operators to "be careful."
2. **Oscillation/hunting between AI-recommended action and rule-based fallback**: When the AI service degrades (E3/E6) mid-cycle — not fully down, but flapping between available and timing out — the system can bounce between AI-driven and rule-based control on the same actuator within a short window. Each side has a different setpoint logic, so an actuator can be commanded on by one path and off by the other in rapid succession. SPEC A7's 30-second rate limit prevents *rapid* toggling but does not by itself prevent flapping *across* control-source switches spread over minutes, which is exactly the pattern that produces mechanical wear on fans/relays and unstable environmental readings that then feed back into more corrective commands (a classic control-theory hunting loop).

**Why it happens:**
Two independent decision-makers (AI path, rule-based fallback path) commanding the same physical actuator is inherently a multi-controller-conflict problem, structurally identical to HVAC systems where heat and cool call for the same equipment simultaneously — a well-known cause of short-cycling and premature relay/contactor failure in real HVAC installations. SPEC's E3/E6 switch is a hard cutover (all-or-nothing to rule-based), which is good, but the *transition itself* — the moment the system is deciding "is AI back up or not" — is where flapping happens if not debounced.

**How to avoid:**
- Add an explicit **debounce/hysteresis window** around the AI-available ↔ fallback-active transition (e.g., require AI to be healthy for N consecutive cycles before handing control back, not just 1 successful response) — this is the same "add a time-delay relay to filter brief signal drops" pattern used to fix HVAC short-cycling in the field.
- Enforce a **global minimum command interval per actuator regardless of which controller (AI-driven or rule-based) issued the last command** — SPEC A7's rate limit should apply to the actuator, not per-source, otherwise AI and rule-engine can each individually respect the 30s limit while alternating and producing an effective faster toggle rate.
- Counter automation bias explicitly: don't let approve become a single reflexive tap. Surface confidence and reason prominently (already speced), but also track and periodically report *operator override/approve ratio* — if approve-without-edit approaches ~100% over weeks, that's a signal the operator has stopped evaluating, not that the AI has gotten perfect.
- For alert fatigue: separate "routine, expected" notifications from "needs judgment" ones in UI treatment (not just cooldown timing) — cooldown/dedup (A8/B8) reduces volume but doesn't fix habituation if every alert looks the same regardless of stakes.

**Warning signs:**
- Actuator on/off event log shows alternating command sources (AI then rule-based then AI) within a short window around AI service degradation.
- Operator approval time-to-click trends toward near-zero over weeks (rubber-stamping).
- Low-confidence-recommendation counter (E4's "≥5 in 1 hour") fires but operators still routinely hit approve on those low-confidence items rather than manually investigating.

**Phase to address:**
Actuator control/arbitration phase (extends A7/B7) for the technical debounce and per-actuator rate limiting; dashboard/UX phase for the alert-treatment and override-ratio monitoring. Both should be verified before auto-apply mode (A6) is enabled by default for any zone.

---

### Pitfall 3: Computer-vision growth metrics look validated in the lab but silently degrade across a real growing season

**What goes wrong:**
YOLOv8 detection/counting and stage-classification models trained and validated once (per SPEC C2's ≥80-90% accuracy targets) are treated as "done" after initial deployment. In practice: (1) occlusion from overlapping mushroom caps and self-shadowing changes shape as the crop matures — a model validated on early-stage, well-separated pins undercounts or double-counts once caps overlap in dense flushes; (2) even with SPEC C1's fixed LED lighting, factors outside the "day/night variance" the spec addresses still shift image statistics over a season — LED output degrades/yellows with age, condensation forms on the lens in a high-humidity environment, dust/spore residue accumulates on the lens glass; (3) substrate color, tray material wear, and algae/mold growth on non-mushroom surfaces change the background the model has to segment against, which is a distribution shift the original validation set never saw. None of this is a "camera offline" event (C3 catches that) — the camera is working, images look fine to a human, but the model's accuracy quietly drops below its validated threshold with no automated signal.

**Why it happens:**
Teams treat the labeled validation dataset (correctly required by SPEC C2/Acceptance Notes) as a one-time gate rather than an ongoing budget item. Building that dataset (100+ images per anomaly class per SPEC C2) is consistently underestimated in cost/time — it requires domain-expert labeling (pin/young/mature/overmature stages, mold/rot/stunted/discoloration classes) which is expensive, slow, and needs to be *repeated* as growing conditions, substrate, or camera hardware change, not done once at launch.

**How to avoid:**
- Budget dataset labeling as a recurring cost across the growing season(s), not a one-time pre-launch task — plan for periodic re-labeling batches (e.g., start of each flush cycle) specifically targeting late-stage/occluded/overlapping specimens, which are underrepresented if the first dataset was built early in the project timeline.
- Add an automated **model-confidence/drift proxy** independent of the "camera offline"/"image quality" checks already in C3: track the CV model's own prediction-confidence distribution over time and alert if it trends downward, and periodically sample images for human spot-check against model output (not just at initial validation).
- Explicitly test the count/size models against overlapping/dense-flush images *before* declaring the metric production-ready — SPEC C2 already defines "≥50% visible" for partial-occlusion counting, but that rule needs a labeled test set specifically of dense/overlapping trays, not just well-separated specimens, or the 15% count-error target will be measured against an easier distribution than production.
- Include lens/LED maintenance (cleaning schedule, LED output check) as an operational task, not assume "fixed lighting" (C1) means "maintenance-free lighting."

**Warning signs:**
- Model accuracy/precision on spot-check samples trends down over weeks without any C3 image-quality-fail or camera_offline flag firing.
- Count-error or size-error appears to correlate with crop maturity stage (worse late in a flush cycle than early).
- Labeling backlog for anomaly classes never reaches the required ≥100 images/class within project timeline, so a class is deployed with an under-validated dataset "for now" and that "for now" becomes permanent.

**Phase to address:**
CV pipeline phase (extends C2) for the dense/occlusion-specific test set and confidence-drift monitoring; ongoing operations/maintenance phase for lens/LED upkeep and periodic re-labeling cadence. This should be flagged for deeper phase-specific research given labeling-cost estimation is commonly wrong by 2-5x in agri-CV projects.

---

### Pitfall 4: Actuator-commanding IoT security treated as "add auth later" instead of a physical-safety control

**What goes wrong:**
SPEC's Security §1-5 already specifies auth, TLS, device authentication, input validation, and rate limiting — which is the right list. The pitfall is in *sequencing and enforcement depth*: teams commonly implement device authentication as a simple shared API key or unsigned device ID header (rather than per-message signed/HMAC payloads with a nonce or timestamp), which blocks casual access but does **not** block a **replay attack** — an attacker (or a compromised device on the same network) who captures one valid "temperature: 22°C" or "cooling_fan: ON" message can retransmit it later regardless of "authentication" being present, because authentication proves *who* sent the original message, not that *this* message is fresh. In an actuator-commanding system this is a physical-safety issue, not just a data-integrity one: a replayed "sensor value: safe range" message can suppress a real alert while the greenhouse is actually overheating, and a replayed "fan: ON" command combined with unrate-limited delivery is precisely the "command flooding causing physical DoS" scenario Security §5 already names as a concern — but rate-limiting on the command-processing side doesn't stop replay if the replayed messages are spread out to individually pass the rate limit.

**Why it happens:**
"Device authentication" and "message freshness/anti-replay" are frequently conflated as the same control when they are not — this is a well-documented gap across IoT/agricultural-sensor security literature, and smart-irrigation/smart-agriculture case studies specifically call out sensor-output spoofing (not just device impersonation) as the exploitable path that changes real actuator behavior.

**How to avoid:**
- Require every signed device payload (Security §3) to include a monotonic sequence number or timestamp + nonce, and reject/flag messages outside an acceptable freshness window or with a reused sequence number — this closes the replay gap without changing the "signed payload" mechanism already speced.
- Rate-limiting (Security §5 / A7) should be enforced **server-side per actuator regardless of source authenticity** — a valid, authenticated, non-replayed command stream can still flood if the device firmware misbehaves; the 30s-per-actuator limit needs to be the actual last line of defense, not just a UX nicety.
- Apply the same anti-replay reasoning to control commands flowing *to* devices, not just sensor data flowing *from* them — SPEC A7's `command_id` idempotency key is a good start (prevents duplicate *processing* of the same intended command) but should also be checked against a freshness window so a captured valid command can't be replayed by an attacker to force a state later.
- Treat "single-greenhouse deployment" (SPEC Security §7 scope note) as reducing exposed-network-surface risk, not as a reason to defer device-level security — a single greenhouse still has a local network (Wi-Fi/LAN to ESP32s) that is the actual attack surface for spoofing/replay, independent of multi-tenancy.

**Warning signs:**
- Device authentication design uses only a static shared key/ID with no per-message timestamp, nonce, or sequence check.
- No logged rejection path exists for "duplicate/replayed command_id" or "sensor payload timestamp outside window" — if these paths have never been exercised/tested, they likely don't exist yet even if "signed payload" is checked off.
- Rate limiting is implemented only at the API-gateway/application layer with no check that it holds even if a device sends authenticated, distinctly-timestamped, but rapid legitimate-looking commands.

**Phase to address:**
Security/device-authentication phase (extends Security §3/§5, A7's command_id) — should be verified with an explicit replay-attack test (capture-and-resend a valid sensor/command payload) before production deployment, per SPEC's own Acceptance Notes requirement that security requirements pass review before deploy.

---

### Pitfall 5: Control logic tuned for "safe range" thresholds without protecting the specific transitions mushroom cultivation is actually sensitive to

**What goes wrong:**
SPEC A8/B8 define static abnormal-range thresholds (e.g., <15°C or >32°C; <60% or >90% RH) which are necessary but not sufficient for mushroom cultivation specifically. Mushroom crops are damaged less by a single static value and more by (a) **temperature/humidity swings and instability** during the fruiting stage even when each individual reading stays inside the "safe range," and (b) **sustained high humidity** (which is required for fruiting) creating exactly the conditions contamination organisms (mold, bacteria) also thrive in — meaning the "safe" humidity zone for the crop (85-95% RH per cultivation guidance) overlaps heavily with the "high contamination risk" zone, and a system that only alarms outside 60-90% RH (SPEC B8 default) will run the greenhouse at its highest-contamination-risk edge as *normal, unalarmed* operation for the fruiting stage, which needs the *high end* of that range. A steady, slightly-suboptimal environment is measurably safer for the crop than an unstable "optimal on average" one that swings across the setpoint — so a control loop that oscillates (Pitfall 2) or arbitrates conflicting temp/humidity actuators (SPEC B7) in a way that produces frequent overshoot-correct-overshoot cycles is a contamination risk multiplier even if every individual reading stays technically in-range.

**Why it happens:**
Static min/max thresholds are the easiest control primitive to implement and are what most generic IoT dashboards ship with by default, but mushroom cultivation's actual failure mode (contamination from sustained high humidity + stagnant air, and mycelial stress from *swings* not just absolute values) is a *stability/rate* problem, not purely a *range* problem, and it also differs by growth stage (colonization wants different temp than fruiting per cultivation guidance) whereas SPEC's thresholds as written are not yet stage-aware.

**How to avoid:**
- Add a **stability/variance metric** alongside the existing range-based alerts — e.g., alert if humidity or temperature has swung by more than X% within a Y-minute window even if both endpoints are individually "in range," since this is the documented mycelium-stress/contamination-risk pattern, not just an edge-case threshold breach.
- Make target ranges and abnormal thresholds **stage-aware** (colonization vs. fruiting), not one static set of numbers for the whole grow cycle — SPEC B4 already scopes target humidity per greenhouse zone; extend that scoping to account for growth stage (which C2's stage-classification output could actually feed, creating a natural CV→control coupling worth flagging for a later phase).
- Ensure exhaust ventilation's fail-open safe-default (Safe-State Table) is understood by operators as a *contamination-risk-reduction* choice specifically (continuous air exchange reduces the stagnant-high-humidity conditions contamination needs), not only a CO2/gas-exchange justification — this affects how operators are trained to interpret and respond to that safe-state, and should be called out when documenting the Safe-State Table rationale.
- When B7 arbitration resolves a temp/humidity actuator conflict, log not just "which command won" but track whether the resulting sequence of resolutions is producing oscillation (tie this to Pitfall 2's hunting-detection mechanism) — arbitration correctness and stability are two different properties and SPEC currently only requires logging the former.

**Warning signs:**
- Humidity readings frequently sit at 88-90% RH (inside "normal," near the alarm edge) for extended periods with no alert, while contamination incidents occur — the alerting logic and the actual risk model are misaligned.
- Alert/log data shows short-interval oscillation between two setpoints on the same actuator pair (fan vs. humidifier/vent) that never individually breaches an abnormal threshold long enough to alert.
- No control-logic distinction exists between "colonization phase" and "fruiting phase" targets even though CV (C2) already classifies growth stage.

**Phase to address:**
Environmental control-logic phase (extends A8/B8/B7) for stability/variance-based alerting; a later integration phase once C2 stage-classification is reliable, to connect stage output to stage-aware setpoints — flag this second part as a "phase 2+" enhancement rather than blocking initial launch, since it depends on CV accuracy already being validated (Pitfall 3).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|-----------------|-----------------|
| Static shared-key device "authentication" instead of signed payload + nonce/timestamp | Faster to ship device provisioning | Leaves replay-attack gap on actuator commands and sensor data — a physical-safety hole, not just a data one | Never for production; maybe for a bench/dev-only prototype with no real actuators attached |
| Single global actuator rate limit enforced only in the API layer, not verified against firmware-level command execution | Simpler initial implementation | Firmware-level bug or malicious/duplicate device could still cause rapid physical cycling despite API "looking" rate-limited | Only acceptable pre-production while actuators are simulated, never once real motors/relays are wired |
| One-time CV validation dataset built before launch, no re-labeling budget planned | Meets initial C2 acceptance criteria on schedule | Model accuracy silently drifts across the season (Pitfall 3); "done" checkbox becomes stale | Acceptable only if an explicit re-validation checkpoint is scheduled (e.g., each flush cycle) — never as a true one-time task |
| Static min/max alert thresholds with no stability/variance check | Simple to implement and explain to users | Misses the swing/oscillation failure mode that's actually most damaging to mycelium/contamination risk | Acceptable for MVP if explicitly documented as a known gap and stability metric is roadmapped for a near-term follow-up phase |
| Debounce/hysteresis on AI-available↔fallback transitions skipped ("just switch immediately, it's simpler") | Simpler state machine | Enables control-source flapping and actuator hunting exactly when the system is already degraded (worst possible time) | Never — this is cheap to add and the failure mode it prevents is high-severity |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|-----------------|-------------------|
| Forecast/Pattern engine (Python microservice, A4/A5) | Treating a slow/timed-out response the same as any other application error, without a fast circuit-breaker, so every control cycle waits out the full 5s timeout before falling back | Fail fast with a circuit breaker after N consecutive timeouts so E3/E6 fallback engages quickly and consistently, not on a per-request 5s wait each time |
| LLM recommendation-text generator (A6) | Allowing the LLM response schema validation to be loose enough that a malformed/hallucinated numeric value could leak into the `target_temp` or `action` field despite the spec's intent that only rule/forecast engine computes numbers | Strictly validate that the LLM call's output is used *only* for the `reason` text field; enforce this with a schema that structurally cannot carry the LLM's own numbers into control fields (e.g., LLM call only ever receives/returns a string, never gets write access to the action/target_temp fields) |
| YOLOv8 + classifier CV pipeline (C2) | Deploying detection and classification models with a shared/implicit versioning scheme, so a silent model update changes count/stage output distributions without anyone noticing which model version produced a given historical reading | Version-tag every stored CV result with model version(s) used, so accuracy regressions can be traced to a specific deployment and old results aren't misinterpreted as directly comparable to new-model results |
| Device provisioning (ESP32 + SHT31-D, burned-in device ID) | Treating "burned-in device ID" alone as sufficient device identity without a corresponding revocation/rotation path if a device is compromised or physically replaced | Pair burned-in ID with a rotatable signing key/cert issued at provisioning time, with a documented revoke-and-reprovision process for lost/compromised/replaced hardware |
| Push notification + Email alerting (A8/B8) | Adding "LINE Notify in future" (per spec) as a bolt-on channel without also carrying forward the same cooldown/dedup and severity-tiering logic | Design the alert-dispatch layer so channel is a delivery detail, not a re-implementation — cooldown, dedup, and severity/escalation logic must be shared across all channels including future ones |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Storing every raw 10s reading indefinitely in the hot query path instead of relying on the spec'd hourly aggregate for trend views | Dashboard/trend queries slow down as raw retention (90 days per A3) accumulates | Query hourly aggregates for any view beyond a short recent window; reserve raw 10s data for recent-window/debugging queries only | Noticeable once raw retention approaches its 90-day cap across multiple zones/sensors |
| Synchronous per-request calls to the Python AI microservices on every 10s sensor tick | Control loop latency grows, risking missed actuator-command SLA or backlog under any AI service slowdown | Decouple sensor ingestion cadence (10s) from AI inference cadence — AI forecast/recommendation doesn't need to run every 10s; batch/schedule appropriately and let the rule-based layer handle the tight loop | Becomes visible once AI service latency approaches the 5s dashboard SLA or A7's actuator ack window |
| CV pipeline processing every captured image inline/blocking the same service handling actuator control | A slow YOLOv8 inference cycle could delay unrelated control-loop responsiveness if services aren't isolated | Keep CV pipeline as a genuinely separate internal microservice (per spec's architecture) with its own queue/backpressure, never sharing a request-handling thread with actuator-control logic | Becomes a real risk once image resolution/frequency increases or multiple camera zones are added |
| Storing full-resolution original images for their full 30-day retention with no downsampled/thumbnail tier for dashboard browsing | Dashboard image-history browsing becomes slow/expensive as storage grows | Generate and serve thumbnails/downsampled previews for browsing; keep full-res only for on-demand/audit access | Becomes noticeable once multiple zones' worth of 30-min-interval images accumulate over the 30-day window |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Device "authentication" without message freshness (nonce/timestamp) checks | Replay attack can resend a captured valid sensor reading or actuator command later, suppressing real alerts or re-triggering physical actuator changes (see Pitfall 4) | Signed payloads must include timestamp/nonce/sequence and be checked for freshness/reuse, not just signature validity |
| Rate limiting enforced only at the application/API layer | A misbehaving or compromised device can still flood commands if any path bypasses the API layer, or if authenticated-but-rapid distinct commands slip through per-request checks | Enforce hard per-actuator command rate limits as close to the actuator-driving code as possible, independent of which upstream path issued the command |
| Treating "single-greenhouse deployment" as a reason to relax device/network security | Local network (ESP32s/camera on Wi-Fi/LAN) is still a real spoofing/replay attack surface regardless of multi-tenancy scope | Apply full device-auth/anti-replay/TLS requirements regardless of single- vs multi-site scope — those are orthogonal concerns |
| LLM call given any implicit path to influence numeric control values (e.g., loosely-typed response parsing) | Hallucinated LLM output could leak into actuator-driving numbers despite spec's explicit intent to prevent this | Enforce a strict schema/interface boundary so the LLM call can structurally only produce explanatory text, never a control-affecting field |
| No revocation path for a compromised/replaced device's burned-in ID | A compromised device retains valid credentials indefinitely with no way to cut it off short of full re-provisioning of everything | Pair device identity with a rotatable/revocable credential issued at provisioning, separate from the immutable hardware ID |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-------------------|
| All alerts (routine cooldown-throttled ones and rare high-severity ones) rendered with the same visual weight | Operators habituate to alerts and stop reading them carefully (alert fatigue), increasing risk they miss the one that matters | Visually and structurally differentiate severity tiers (e.g., E5 unresponsive-device critical alerts vs. routine threshold alerts), independent of the shared cooldown/dedup mechanism |
| One-tap "approve" for AI recommendations with no friction proportional to confidence or impact | Encourages automation bias / rubber-stamping over time, even though spec already gates low-confidence auto-apply | Surface the recommendation's reason and confidence prominently in the approval UI itself (not a separate screen), and consider requiring a brief acknowledgment of *why* for low-to-mid confidence items even when not auto-blocked |
| Dashboard shows only current stage-classification and anomaly output without historical trend of CV confidence itself | Operators can't tell if a mushroom-anomaly detection is a stable finding or a shaky borderline call | Surface the CV model's own confidence/consistency across recent frames for a given metric, not just the latest classification label |
| Safe-state entry (E1/E5) shown as a generic "system in safe mode" message | Operators may not understand *why* fan is OFF but ventilation is ON, and could manually override in the wrong direction | Explain the specific safe-state rationale per actuator (fail-closed vs. fail-open) inline, referencing the Safe-State Table reasoning, when displaying the safe-state alert |

## "Looks Done But Isn't" Checklist

- [ ] **Sensor validation (A1):** Often missing drift detection — verify there's a mechanism beyond range/rate-of-change checks that catches slow, gradual divergence from ground truth, not just instant anomalies.
- [ ] **Device authentication (Security §3):** Often missing anti-replay (nonce/timestamp/sequence) — verify a captured-and-resent valid payload is actually rejected, not just an unsigned one.
- [ ] **Rate limiting (A7/Security §5):** Often missing enforcement independent of command source — verify the 30s-per-actuator limit holds even when AI and rule-based fallback alternate issuing commands around a control-source switch.
- [ ] **AI/rule-engine fallback (E3/E6):** Often missing debounce on the transition itself — verify there's no scenario where flapping AI-service health causes rapid alternation between AI-driven and rule-based commands on the same actuator.
- [ ] **CV validation dataset (C2):** Often missing a re-validation/re-labeling cadence — verify accuracy is checked against fresh data periodically, not just once before initial "done" sign-off, and specifically includes dense/overlapping-specimen images, not only well-separated ones.
- [ ] **Humidity alerting (B8):** Often missing stability/variance-based alerting — verify the system can detect a swinging/oscillating pattern even when every individual reading stays inside the static 60-90% range.
- [ ] **LLM recommendation boundary (A6/Tech Stack):** Often missing a hard schema boundary — verify by testing that a malformed/hallucinated LLM response literally cannot populate a numeric control field, not just that the current prompt happens not to do so.
- [ ] **Safe-State Table (E1/E5):** Often missing an operator-facing explanation of *why* each actuator's safe-default differs — verify the alert UI actually communicates the fail-open/fail-closed rationale, not just the state itself.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|-----------------|
| Sensor drift discovered after months of undetected divergence | MEDIUM | Cross-check recent readings against a reference instrument, backfill a correction offset if consistent drift is confirmed, flag affected historical data as `drift-suspected` rather than silently correcting it retroactively, and add the missing drift-detection mechanism (Pitfall 1) going forward |
| Actuator hunting/oscillation discovered via relay wear or unstable readings | MEDIUM | Add the debounce/hysteresis window and per-actuator (not per-source) rate limiting retroactively; audit actuator command logs for the historical oscillation pattern to estimate mechanical wear exposure and consider proactive relay/fan inspection |
| CV model accuracy found to have drifted below its validated threshold | MEDIUM-HIGH | Pull a fresh spot-check sample, compare against expert labels, and either retrain/fine-tune on recent-season imagery or narrow the model's claimed operating envelope (e.g., flag reduced confidence for dense/late-stage flushes) until re-validated |
| Replay-attack gap discovered in device authentication | HIGH | This requires a credential/protocol-level fix (add nonce/timestamp to the signing scheme), which likely means re-provisioning all devices with updated firmware — treat as a security incident-response exercise: audit logs for any signs of past replay, rotate all device keys, then roll out the fixed protocol |
| Contamination incident traced to a stable-but-high-humidity or oscillating environment that never breached static thresholds | LOW-MEDIUM | Add the stability/variance-based alert (Pitfall 5) and, if stage-aware targets aren't yet implemented, tighten the static threshold band as an interim mitigation while the stage-aware logic is built |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|-------------------|---------------|
| Sensor drift vs. noise (Pitfall 1) | Sensor ingestion/validation phase (extends A1) | Confirm a drift-detection/reference-check mechanism exists distinct from range/rate-of-change validation, with logged sensor calibration metadata |
| Automation bias & AI/rule-engine oscillation (Pitfall 2) | Actuator control/arbitration phase (extends A7/B7) + dashboard/UX phase | Confirm debounce on AI-available↔fallback transitions; confirm per-actuator (not per-source) rate limiting; confirm approval-ratio monitoring exists in the UI/ops layer |
| CV accuracy drift over a season (Pitfall 3) | CV pipeline phase (extends C2) + ongoing operations phase | Confirm a re-validation cadence and dense/occlusion-specific test set exist, not just the initial pre-launch validation set |
| Replay/spoofing gap in actuator-commanding security (Pitfall 4) | Security/device-authentication phase (extends Security §3/§5, A7 command_id) | Confirm an explicit replay-attack test (capture-and-resend) is part of the pre-production security review required by SPEC's Acceptance Notes |
| Static thresholds missing stability/contamination-risk coupling (Pitfall 5) | Environmental control-logic phase (extends A8/B8/B7) | Confirm a variance/stability-based alert exists alongside static range alerts; flag stage-aware setpoints (coupling to C2 output) as a follow-on phase once CV stage-classification is validated |

## Sources

- [SensorTalk: An IoT Device Failure Detection and Calibration Mechanism for Smart Farming](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6864446/) — sensor drift/failure-detection tradeoffs in real smart-farming deployments (MEDIUM confidence, cross-checked)
- [Multi-Sensor Monitoring, Intelligent Control, and Data Processing for Smart Greenhouse Environment Management](https://pmc.ncbi.nlm.nih.gov/articles/PMC12526782/) — lab-vs-field reliability gap in greenhouse sensor systems (MEDIUM confidence)
- [Human in the loop artificial intelligence: applications, outcomes, and implementation challenges](https://www.sciencedirect.com/science/article/pii/S1386505626001024) — automation bias and alert-fatigue dynamics in human-in-the-loop systems (MEDIUM confidence, cross-checked with additional HITL sources)
- [Human In The Loop and Cognitive Load Fatigue](https://pub.towardsai.net/human-in-the-loop-and-cognitive-load-fatigue-716b6bb078f8) — reviewer/oversight fatigue mechanics (MEDIUM confidence)
- [Machine Vision Systems in Precision Agriculture for Crop Farming](https://pmc.ncbi.nlm.nih.gov/articles/PMC8321169/) and [Computer vision technology in agricultural automation — A review](https://www.sciencedirect.com/science/article/pii/S2214317319301751) — occlusion/lighting-variance impact on crop-vision accuracy and field-vs-lab generalization gap (MEDIUM confidence, cross-checked across both sources)
- [A Vulnerable-by-Design IoT Sensor Framework for Cybersecurity in Smart Agriculture](https://doi.org/10.3390/agriculture15121253) and [Literature Review: IoT Device Authentication Mechanism to Prevent Injection Attacks on Smart Agriculture Database](https://ejournal.omahtabing.com/knj/en/article/view/479) — sensor spoofing/injection risk specific to agricultural actuator systems (MEDIUM confidence, cross-checked)
- General IoT replay-attack/anti-replay literature (nonce/timestamp mitigation pattern) — cross-checked across multiple independent security-survey sources returned in research (MEDIUM confidence)
- [Mushroom Cultivation Temperature and Climate Control: Choosing the Right Sensors is Crucial](https://www.epluse.com/news/blog/detail/2025-08-27-mushroom-cultivation-temperature/), [Temperature and Humidity in Mushroom Cultivation](https://www.mycopowered.com/post/the-role-of-temperature-and-humidity-in-mushroom-growth), [Top 7 Factors That Affect Mushroom Cultivation](https://zombiemyco.com/blogs/mushrooms/top-factors-that-affect-mushroom-cultivation), [7 Factors Affecting Mushroom Cultivation](https://atlas-scientific.com/blog/factors-affecting-mushroom-cultivation/) — humidity/contamination overlap, temperature-swing stress on mycelium, stage-dependent setpoints (MEDIUM confidence, cross-checked across 4 independent cultivation-guidance sources)
- HVAC short-cycling / dual-controller-conflict / relay-wear field guidance (general HVAC troubleshooting sources) — used as a structurally analogous, well-documented pattern for actuator-conflict/hunting risk, not agriculture-specific (LOW-MEDIUM confidence, general-domain analogy rather than direct greenhouse-IoT source)
- SPEC.md and PROJECT.md (project-internal) — used throughout to anchor each pitfall to the specific mechanism it extends or a gap it exposes

---
*Pitfalls research for: AI-assisted mushroom-greenhouse environmental control (IoT + AI/CV physical actuator system)*
*Researched: 2026-08-18*
