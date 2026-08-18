# SPEC: ระบบควบคุมสภาพแวดล้อมโรงเพาะเห็ด (AI-Assisted)

## Goal
พัฒนาระบบควบคุมอุณหภูมิและความชื้นสำหรับโรงเพาะเห็ด โดยใช้ AI ช่วยวิเคราะห์ข้อมูลเซนเซอร์และช่วยควบคุมสภาพแวดล้อมให้เหมาะสมกับการเพาะเห็ด รวมถึงใช้ Computer Vision ตรวจวัดการเจริญเติบโตของเห็ด

> หมายเหตุ: ค่าตัวเลข (threshold, interval, retention) ในเอกสารนี้เป็นค่าตั้งต้นที่ต้องได้รับการยืนยัน/ปรับจากผู้เชี่ยวชาญด้านการเพาะเห็ดก่อนใช้งานจริง

---

## A. ระบบควบคุมอุณหภูมิ

### A1. การอ่านค่าจากเซนเซอร์
- ระบบรับค่าอุณหภูมิจาก Temperature Sensor ผ่านช่วง -10°C ถึง 60°C (ค่านอกช่วงนี้ถือเป็นค่าผิดปกติ ดู Edge Case E1/E2)
- ความถี่ในการอ่านค่า: ทุก 10 วินาที
- ค่าที่อ่านได้ต้องถูก validate ก่อนบันทึก (range check + rate-of-change check: เปลี่ยนแปลงเกิน 5°C ภายใน 10 วินาที ถือว่าผิดปกติ ให้ flag แต่ยังบันทึกดิบไว้)

### A2. การแสดงผล Real-time
- Dashboard ต้องอัปเดตค่าอุณหภูมิภายใน ≤ 5 วินาทีจากเวลาที่เซนเซอร์อ่านค่าได้ (latency SLA)
- แสดงสถานะ "last updated" และสถานะ connection (online/stale/offline)

### A3. การบันทึกข้อมูลย้อนหลัง
- บันทึกทุกค่าที่อ่านได้ (raw, 10s interval) เก็บไว้ 90 วัน
- Aggregate เป็นค่าเฉลี่ยรายชั่วโมงเก็บไว้ 2 ปี (สำหรับ trend analysis ระยะยาว)
- Schema ขั้นต่ำ: `timestamp, sensor_id, value, status(valid/flagged/interpolated)`

### A4. AI วิเคราะห์รูปแบบการเปลี่ยนแปลง
- นิยาม "รูปแบบ" ที่ต้องตรวจจับ: (1) แนวโน้มขึ้น/ลงต่อเนื่อง (trend), (2) ความผันผวนผิดปกติ (oscillation/noise), (3) รูปแบบวันซ้ำ (daily cycle anomaly)
- Output: label ประเภทรูปแบบ + ช่วงเวลาที่ตรวจพบ + ค่า confidence score (0-1)
- เกณฑ์ยอมรับ (acceptance criteria): ต้องตรวจพบ pattern ที่มนุษย์ label ไว้ใน validation set ได้ ≥ 80% (recall)

### A5. AI ประเมินแนวโน้มอุณหภูมิในอนาคต
- Forecast horizon: 1 ชั่วโมง และ 6 ชั่วโมงข้างหน้า
- Metric ยอมรับ: MAE ≤ 1.5°C สำหรับ forecast 1 ชม., MAE ≤ 3°C สำหรับ forecast 6 ชม. (วัดจาก validation set ย้อนหลัง)
- ต้องแสดง confidence interval คู่กับค่าพยากรณ์

### A6. AI แนะนำการปรับอุณหภูมิ
- Output format: `{action: "increase_cooling"|"decrease_cooling"|"no_action", target_temp, reason, confidence}`
- โดย default คำแนะนำต้องผ่านการอนุมัติจากผู้ใช้ก่อนสั่งอุปกรณ์ (manual approve) เว้นแต่ผู้ใช้เปิด "auto-apply mode" อย่างชัดเจนใน settings
- หาก confidence < 0.6 → ห้าม auto-apply แม้เปิด auto-apply mode ไว้ก็ตาม ต้องแจ้งเตือนให้ตรวจสอบเอง

### A7. การควบคุมพัดลม/ระบบทำความเย็น
- Protocol: ส่งคำสั่งผ่าน API พร้อม `command_id` (idempotency key)
- ต้องได้รับ ack จากอุปกรณ์ภายใน 5 วินาที มิฉะนั้น retry สูงสุด 3 ครั้ง (interval 5s)
- หาก retry ครบ 3 ครั้งยังไม่ ack → เข้าสถานะ `device_unresponsive` (ดู Edge Case E5)
- Manual override: ผู้ใช้สามารถสั่ง override คำสั่งจาก AI ได้เสมอ คำสั่ง manual มี priority สูงกว่า AI-generated command เสมอ และจะ lock ไม่ให้ AI สั่งทับเป็นเวลา 15 นาที หลัง manual command ล่าสุด
- Rate limit: จำกัดคำสั่งเปิด/ปิดอุปกรณ์เดียวกันไม่เกิน 1 ครั้งต่อ 30 วินาที เพื่อป้องกันความเสียหายเชิงกล (motor/relay wear)

### A8. การแจ้งเตือนอุณหภูมิผิดปกติ
- Threshold ผิดปกติ: ต่ำกว่า 15°C หรือสูงกว่า 32°C (ค่าตั้งต้น, ปรับได้ตามสายพันธุ์เห็ด)
- ช่องทางแจ้งเตือน: Push notification (in-app) + Email (สามารถเพิ่ม LINE Notify ในอนาคต)
- Cooldown/dedup: แจ้งเตือนซ้ำสำหรับ alert ประเภทเดียวกันไม่เกิน 1 ครั้งต่อ 15 นาที จนกว่าค่าจะกลับสู่ระดับปกติ

---

## B. ระบบควบคุมความชื้นในอากาศ

### B1. การอ่านค่า Humidity Sensor
- ช่วงค่าที่ยอมรับ: 0-100% RH, ความถี่อ่านค่าทุก 10 วินาที, validation rule เดียวกับ A1

### B2-B3. Real-time display + บันทึกย้อนหลัง
- ใช้ SLA/retention เดียวกับ A2/A3

### B4. ค่าเป้าหมายความชื้น (Target Humidity)
- ผู้ใช้ที่มีสิทธิ์ (role: operator/admin) กำหนดค่าเป้าหมายได้ ในช่วง 50-95% RH
- Validation: ปฏิเสธค่านอกช่วง พร้อม error message ชัดเจน
- Scope: กำหนดได้ต่อโรงเรือน (per greenhouse zone) ไม่ใช่ค่า global เดียว

### B5. ควบคุมระบบเพิ่มความชื้นอัตโนมัติ / B6. ควบคุมระบบระบายอากาศ
- ใช้ protocol เดียวกับ A7 (ack, retry, rate-limit, manual override priority)

### B7. Conflict Arbitration ระหว่างระบบอุณหภูมิและความชื้น
- ปัญหา: พัดลมระบายอากาศ (ลดความชื้น) อาจขัดแย้งกับพัดลมทำความเย็น (ลดอุณหภูมิ) เนื่องจากเป็นอุปกรณ์คนละชุดที่ส่งผลกระทบร่วมกันต่อสภาพแวดล้อมเดียวกัน
- กฎ arbitration: หากคำสั่งจากระบบ A และ B ขัดแย้งกันในอุปกรณ์เดียวกัน ให้ priority กับคำสั่งที่แก้ปัญหาค่าที่เบี่ยงเบนจาก safe range มากกว่า (normalize เป็น % deviation จาก threshold)
- Log การ arbitration ทุกครั้งเพื่อ audit

### B8. การแจ้งเตือนความชื้นผิดปกติ
- Threshold ตั้งต้น: ต่ำกว่า 60% RH หรือสูงกว่า 90% RH
- ใช้ channel/cooldown เดียวกับ A8

---

## C. ระบบตรวจวัดการเจริญเติบโตของเห็ด (Computer Vision)

### C1. ข้อกำหนดกล้อง (Camera Spec)
- ความละเอียดขั้นต่ำ: 1920x1080, ถ่ายภาพทุก 30 นาที (configurable)
- แสงคงที่: ต้องมีไฟ LED ให้แสงสว่างคงที่ตลอด 24 ชม. เพื่อลด variance จากแสงธรรมชาติ (กลางวัน/กลางคืน)
- มุมกล้อง/ระยะติดตั้งคงที่ ห้ามขยับหลัง calibration เริ่มต้น (ใช้ marker อ้างอิงสำหรับ pixel-to-cm calibration)

### C2. AI วิเคราะห์ภาพ — นิยามผลลัพธ์แต่ละตัว
| รายการ | หน่วย/นิยาม | เกณฑ์ยอมรับ |
|---|---|---|
| ขนาดดอกเห็ด | เส้นผ่านศูนย์กลาง (cm) หลัง calibration pixel→cm | error ≤ 10% เทียบกับวัดจริงในชุด validation |
| จำนวนดอกเห็ด | count ต่อภาพ (รวม partial-occluded ที่ระบุ ≥50% ของดอกมองเห็น) | count error ≤ 15% |
| พื้นที่ปกคลุม | % ของพื้นที่ถาด/ชั้นที่ถูกปกคลุม | error ≤ 10% |
| สีของเห็ด | ค่าเฉลี่ย RGB/HSV ของ region เห็ด เทียบกับ reference color chart | classification accuracy ≥ 85% (ปกติ/ผิดปกติ) |
| รูปร่าง | shape descriptor (aspect ratio ของ cap) ใช้ประกอบ stage classification | ไม่ตั้ง metric เดี่ยว ใช้รวมกับ C2-stage |
| ระยะการเจริญเติบโต | classification เป็น 4 stage: pin / young / mature / overmature (ต้อง label โดยผู้เชี่ยวชาญ) | accuracy ≥ 80% เทียบ label ผู้เชี่ยวชาญ |
| ความพร้อมเก็บเกี่ยว | derived rule จาก stage=mature + size ≥ threshold ที่กำหนดโดยผู้เชี่ยวชาญ (ไม่ใช่ subjective AI judgment ตรง ๆ) | validate กับผู้เชี่ยวชาญ ≥ 90% agreement |
| ความผิดปกติของเห็ด | classification เป็น class ที่กำหนดล่วงหน้า: เชื้อรา (mold), เน่า (rot), แคระ (stunted), สีผิดปกติ (discoloration) | precision ≥ 80% ต่อ class, ต้องมี labeled dataset ต่อ class ≥ 100 ภาพ |

- ทุก metric ข้างต้นต้องมี labeled validation dataset ก่อน deploy ใช้งานจริง (ไม่ยอมรับ "unsupervised subjective output" โดยไม่มี ground truth)

### C3. Camera Failure Handling
- หากไม่ได้รับภาพใหม่ภายใน 2 รอบถ่ายภาพ (เช่น 1 ชม. หาก interval=30 นาที) → flag `camera_offline` และแจ้งเตือน operator
- ตรวจจับภาพเสีย/มืด/เลนส์สกปรก ด้วย image quality check (brightness/blur score) ก่อนส่งเข้า AI pipeline หากไม่ผ่าน → ไม่ประมวลผล + log `image_quality_fail` + แจ้งเตือนหากเกิดต่อเนื่อง 3 รอบ

### C4. การจัดเก็บภาพ
- เก็บภาพต้นฉบับ 30 วัน, เก็บผลวิเคราะห์ (metadata) 2 ปี
- Access control: เข้าถึงภาพได้เฉพาะผู้ใช้ที่มีสิทธิ์ในโรงเรือนนั้น (per-zone authorization)

---

## Tech Stack
- Backend / Orchestrator: Node.js + Express — รับผิดชอบ API, auth, business logic, arbitration (A7/B7), และเรียก microservice ด้านล่างผ่าน internal REST (ไม่เปิด public)
- Temperature/Humidity Sensor: **SHT31-D** (I2C, accuracy ±0.3°C / ±2% RH) ต่อผ่าน microcontroller (เช่น ESP32) ที่มี unique device ID (burned-in ตอน provisioning) สำหรับ device authentication ตาม Security §3
- AI Service แยกเป็น 3 องค์ประกอบ (แยกความรับผิดชอบ เพราะงานคนละประเภทต้องการโมเดลคนละแบบ):
  1. **Forecast/Pattern engine** (A4, A5): time-series model (เช่น Prophet หรือ LSTM ขนาดเล็ก) รันเป็น internal Python microservice, เรียกผ่าน REST จาก Express, ต้องมี timeout config (เช่น 5s) และ error response เป็น JSON ที่ parse ได้แน่นอน
  2. **Recommendation text generator** (A6): เรียก LLM API (เช่น Claude API) เพื่อสร้างคำอธิบายภาษาธรรมชาติเท่านั้น — **ตัวเลข/action ของคำแนะนำคำนวณจาก rule/forecast engine ข้อ 1 ไม่ใช่จาก LLM** (ป้องกัน LLM hallucinate ค่าตัวเลขควบคุมอุปกรณ์จริง)
  3. **CV pipeline** (C2): **YOLOv8** (detection สำหรับนับ/วัดขนาด/พื้นที่ปกคลุม) + classification model แยกสำหรับ stage การเจริญเติบโตและ disease/anomaly class รันเป็น internal Python microservice
- Secrets management: เก็บ API key ของ LLM/AI Service ใน environment variable / secret manager เท่านั้น ห้าม hardcode หรือส่งให้ client

---

## Non-Functional Requirements: Security

1. **Authentication/Authorization**: ทุก API endpoint (dashboard data, sensor ingest, control command) ต้องผ่าน authentication; คำสั่งควบคุมอุปกรณ์ (actuator command) ต้องจำกัดเฉพาะ role operator/admin
2. **Transport security**: บังคับใช้ HTTPS/TLS สำหรับทุก endpoint ปิดการใช้งาน plain HTTP
3. **Device authentication**: เซนเซอร์และกล้องต้องยืนยันตัวตนด้วย device key/signed payload เพื่อป้องกันการปลอมข้อมูลเซนเซอร์ (sensor spoofing) ที่อาจทำให้ระบบสั่งงานผิด (เช่น ค่าอุณหภูมิปลอมต่ำเกินไปทำให้เครื่องทำความร้อนทำงานค้าง เสี่ยงไฟไหม้)
4. **Input validation**: validate type/range ของทุกค่าที่รับจากเซนเซอร์ก่อนบันทึกลง DB ป้องกัน injection/overflow
5. **Rate limiting**: จำกัดความถี่คำสั่งควบคุมอุปกรณ์ (ดู A7) ป้องกันความเสียหายทางกลไกจาก command flooding (physical DoS)
6. **Image/data privacy**: จำกัดการเข้าถึงภาพกล้องตาม access control (C4)
7. **Multi-site scope**: เวอร์ชันนี้ออกแบบสำหรับ single-greenhouse deployment เท่านั้น การรองรับ multi-tenant จะระบุใน milestone ถัดไป

---

## Edge Cases & Error Behaviors

| Edge Case | Detection | Fallback Behavior | Alert |
|---|---|---|---|
| E1. ไม่สามารถอ่านค่าจากเซนเซอร์ได้ | ไม่มีข้อมูลใหม่เกิน 30 วินาที (3 รอบ) | ใช้ค่าล่าสุดที่ valid (interpolate) สูงสุด 5 นาที หลังจากนั้นแสดงสถานะ "no data" บน dashboard. **ระหว่างช่วง interpolation (0-5 นาที): actuator คงคำสั่งล่าสุดไว้ (freeze state) ห้ามสั่งงานใหม่จาก AI/rule engine โดยอิงข้อมูล stale นี้.** เมื่อพ้น 5 นาทีเข้าสถานะ no-data เต็มรูปแบบ → ยึด **Safe-State Table** (ดูท้าย E5) กับทุก actuator ที่เกี่ยวข้อง ทันที และปิด auto-control จนกว่าข้อมูลเซนเซอร์กลับมาและ operator acknowledge | แจ้งเตือน operator ทันทีเมื่อเข้าสถานะ no-data |
| E2. เซนเซอร์ส่งค่าผิดปกติ (นอก range หรือ rate-of-change ผิดปกติ) | range/rate check ตาม A1 | บันทึกดิบพร้อม flag `anomalous`, ไม่ใช้ค่านี้เป็น input ให้ AI/actuator logic จนกว่าจะยืนยันด้วยค่าถัดไป | แจ้งเตือนหากค่า anomalous ต่อเนื่อง ≥ 3 ครั้ง |
| E3. AI ไม่สามารถประมวลผลข้อมูลได้ (service error/timeout) | HTTP error/timeout จาก AI Service call | สลับไปใช้ **rule-based fallback controller** (threshold-based on/off ตาม A8/B8 thresholds) ควบคุมอุปกรณ์ต่อโดยไม่พึ่ง AI | แจ้งเตือน operator ว่าระบบทำงานใน fallback mode |
| E4. AI ให้ผลวิเคราะห์ confidence ต่ำ (< 0.6) | ตรวจ confidence score จาก response | ไม่ auto-apply คำแนะนำ, แสดงผลพร้อม flag "low confidence — ตรวจสอบเอง" | แจ้งเตือนเมื่อ low-confidence เกิดต่อเนื่อง ≥ 5 ครั้งใน 1 ชม. (อาจบ่งชี้ปัญหา model/data drift) |
| E5. อุปกรณ์ควบคุมไม่ตอบสนอง (ack timeout หลัง retry ครบ A7) | 3 retry ไม่ ack | เข้าสถานะ safe-default ตาม **Safe-State Table** ด้านล่าง ทันที, เปลี่ยนเป็น manual-only mode, ปิด auto-control ของอุปกรณ์นั้นชั่วคราว | แจ้งเตือน critical ทันที + ต้องมนุษย์เข้ามา acknowledge ก่อนกลับสู่ auto mode; หากยัง unresponsive เกิน 30 นาทีหลัง alert แรก → ยกระดับความรุนแรงของ alert (escalate) |
| E6. ระบบไม่สามารถเชื่อมต่อ AI Service ได้ (network down) | connection error | เหมือน E3 (rule-based fallback) + cache คำขอไว้ retry เมื่อกลับมาออนไลน์ | แจ้งเตือน operator + log downtime duration |
| E7. กล้องใช้งานไม่ได้/ภาพคุณภาพต่ำ | ดู C3 | ข้าม cycle การวิเคราะห์นั้น ใช้ผลล่าสุดที่ valid แทนบน dashboard | แจ้งเตือนตาม C3 |

### Safe-State Table (ใช้กับ E1 หลังพ้น 5 นาที และ E5)

| Actuator | Safe-default state | เหตุผล |
|---|---|---|
| พัดลม/ระบบทำความเย็น (cooling fan) | **OFF** (fail-closed) | ป้องกัน overcool/สิ้นเปลืองพลังงานหากค้างเปิด; อุณหภูมิสูงระยะสั้นอันตรายน้อยกว่าอุปกรณ์ค้างทำงานต่อเนื่องโดยไม่มีการควบคุม |
| ระบบเพิ่มความชื้น (humidifier) | **OFF** (fail-closed) | ป้องกันความชื้นสูงเกินค้าง ซึ่งเสี่ยงเชื้อรา/แบคทีเรียปนเปื้อนมากกว่าความชื้นต่ำระยะสั้น |
| ระบบระบายอากาศ (exhaust ventilation) | **ON** (fail-open) | ต้องรักษาการระบายอากาศ/แลกเปลี่ยน CO2 ต่อเนื่อง — ไม่มีลมเลยอันตรายกว่าลมมากเกินไป |

ทุก actuator ที่เข้าสู่ safe-default ต้อง log เวลาที่เข้าสถานะ, เหตุผล (E1/E5), และเวลาที่ operator acknowledge ก่อนกลับสู่ auto mode

---

## Acceptance / Testability Notes
- ทุก requirement ที่มีคำว่า "real-time", "ผิดปกติ", "แนะนำ", "วิเคราะห์" ในเอกสารนี้ต้องมีค่าตัวเลข/metric/threshold กำกับ (ดังตารางและหัวข้อข้างต้น) — ห้ามเขียน requirement โดยไม่มีเกณฑ์วัดผลที่จับต้องได้
- CV metrics (C2) ทุกตัวต้องมี labeled validation dataset ก่อนถือว่า "พร้อม deploy"
- Security requirements (หัวข้อ Security) ต้องผ่าน security review ก่อน deploy สู่ production
