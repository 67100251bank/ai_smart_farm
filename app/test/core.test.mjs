import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const core = require('../src/core.js');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '\n     →', e.message); }
}
const fresh = (o={}) => core.createState({ seed: 42, ...o });

console.log('\nCTRL-04 · จำกัดความถี่คำสั่ง');
t('คำสั่งซ้ำภายใน 30 วินาทีถูกปฏิเสธ', () => {
  const s = fresh();
  assert.equal(core.sendCommand(s, 'fan', true, 'manual').ok, true);
  s.devices.fan.on = true; s.devices.fan.pending = false;
  const r = core.sendCommand(s, 'fan', false, 'manual');
  assert.equal(r.ok, false); assert.equal(r.rateLimited, true);
  s.clock += 31;
  assert.equal(core.sendCommand(s, 'fan', false, 'manual').ok, true);
});

console.log('\nCTRL-03 · คำสั่งด้วยมือมีสิทธิ์เหนือระบบอัตโนมัติ 15 นาที');
t('คำสั่งอัตโนมัติถูกล็อกไว้ 900 วินาที แล้วกลับมาทำงานได้', () => {
  const s = fresh();
  core.sendCommand(s, 'fan', true, 'manual');
  s.devices.fan.on = true; s.devices.fan.pending = false;
  s.clock += 60; s.sensor.lastSeen = s.clock;
  const blocked = core.sendCommand(s, 'fan', false, 'rule');
  assert.equal(blocked.ok, false);
  assert.match(blocked.reason, /มีสิทธิ์เหนือ/);
  s.clock += 900; s.sensor.lastSeen = s.clock;
  assert.equal(core.sendCommand(s, 'fan', false, 'rule').ok, true);
});
t('ยกเลิกการล็อกด้วยมือได้ทันทีเมื่อผู้ใช้สั่ง', () => {
  const s = fresh();
  core.sendCommand(s, 'fan', true, 'manual');
  s.devices.fan.on = true; s.devices.fan.pending = false;
  s.clock += 40; s.sensor.lastSeen = s.clock;
  core.releaseManual(s, 'fan');
  assert.equal(core.sendCommand(s, 'fan', false, 'rule').ok, true);
});

console.log('\nSEC-02 · สิทธิ์การใช้งาน');
t('บัญชี viewer สั่งงานอุปกรณ์ไม่ได้', () => {
  const s = fresh(); s.role = 'viewer';
  const r = core.sendCommand(s, 'fan', true, 'manual');
  assert.equal(r.ok, false); assert.match(r.reason, /ดูข้อมูลได้อย่างเดียว/);
});

console.log('\nCTRL-01/02 + FAIL-03 · ack / retry / Safe-State');
t('ไม่ตอบรับครบ 3 ครั้ง → unresponsive + Safe-State ต่ออุปกรณ์', () => {
  const s = fresh();
  core.setScenario(s, 'actuatorFail', 'fan');
  core.sendCommand(s, 'fan', true, 'rule');
  for (let i = 0; i < 4; i++) { s.clock += 6; core.step(s, 0); }
  // ใช้ step เพื่อให้ตัวจับเวลา ack ทำงานจริง
  core.step(s, 40);
  assert.equal(s.devices.fan.unresponsive, true, 'ควรถูกทำเครื่องหมายว่าไม่ตอบสนอง');
  assert.equal(s.devices.fan.on, core.C.SAFE.fan, 'พัดลมต้อง fail-closed (ปิด)');
  assert.equal(s.devices.vent.on, core.C.SAFE.vent, 'ระบายอากาศต้อง fail-open (เปิด)');
  assert.equal(s.safeState.active, true);
  assert.ok(s.alerts.some(a => a.key === 'actuator-fan'));
});
t('ต้องให้ผู้ดูแลกดรับทราบก่อนกลับสู่อัตโนมัติ', () => {
  const s = fresh();
  core.setScenario(s, 'actuatorFail', 'fan');
  core.sendCommand(s, 'fan', true, 'rule');
  core.step(s, 60);
  assert.equal(s.safeState.ackRequired, true);
  core.setScenario(s, 'actuatorFail', '');
  assert.equal(core.acknowledgeSafeState(s).ok, true);
  assert.equal(s.safeState.active, false);
});

console.log('\nFAIL-02 · ข้อมูลเซนเซอร์ค้าง');
t('ค้างเกิน 5 นาที → เข้า Safe-State และหยุดคำสั่งใหม่', () => {
  const s = fresh();
  core.setScenario(s, 'sensorFail', true);
  core.step(s, 400);
  assert.equal(core.connection(s), 'offline');
  assert.equal(s.safeState.active, true);
  const r = core.sendCommand(s, 'fan', true, 'rule');
  assert.equal(r.ok, false);
});
t('สถานะการเชื่อมต่อไล่ระดับ online → stale → offline', () => {
  const s = fresh();
  assert.equal(core.connection(s), 'online');
  core.setScenario(s, 'sensorFail', true);
  core.step(s, 120); assert.equal(core.connection(s), 'stale');
  core.step(s, 260); assert.equal(core.connection(s), 'offline');
});

console.log('\nSENS-02 / SEC-03 · ตรวจสอบค่าและตัวตนอุปกรณ์');
t('ค่านอกช่วงที่เป็นไปได้ถูกปฏิเสธ ไม่เข้าประวัติ', () => {
  const s = fresh();
  const before = s.raw.length;
  core.step(s, 7200);
  assert.ok(s.sensor.rejected > 0, 'ต้องมีแพ็กเก็ตที่ถูกปฏิเสธ');
  assert.ok(s.raw.every(r => r.temp > -10 && r.temp < 60), 'ประวัติต้องไม่มีค่านอกช่วง');
  assert.ok(s.raw.length > before);
});
t('ค่าที่เปลี่ยนเร็วผิดปกติถูกติดธงแต่ยังเก็บไว้ (flag ไม่ discard)', () => {
  const s = fresh();
  s.reading = { temp: 25, humid: 84, at: s.clock, valid: true, flags: [] };
  s.truth = { temp: 35, humid: 84 };     // กระโดด 10 °C
  core.step(s, 10);
  assert.equal(s.raw[s.raw.length - 1].flag, 1);
});

console.log('\nCTRL-06 · ตรวจสอบค่าเป้าหมาย');
t('ช่วงความชื้นนอก 50–95 %RH ถูกปฏิเสธ', () => {
  const s = fresh();
  assert.equal(core.setTargets(s, { hMin: 20, hMax: 99 }).ok, false);
  assert.equal(core.setTargets(s, { hMin: 80, hMax: 70 }).ok, false);
  assert.equal(core.setTargets(s, { hMin: 80, hMax: 92 }).ok, true);
  assert.equal(s.targets.hMin, 80);
});

console.log('\nALRT-01/02 · แจ้งเตือนและ cooldown');
t('แจ้งเตือนชนิดเดียวกันถูกรวบภายใน 15 นาที', () => {
  const s = fresh();
  assert.equal(core.raiseAlert(s, 'temp-high', 'critical', 'x'), true);
  assert.equal(core.raiseAlert(s, 'temp-high', 'critical', 'x'), false);
  s.clock += 899;
  assert.equal(core.raiseAlert(s, 'temp-high', 'critical', 'x'), false);
  s.clock += 2;
  assert.equal(core.raiseAlert(s, 'temp-high', 'critical', 'x'), true);
});
t('อุณหภูมิเกินเกณฑ์แจ้งเตือนจริงในสถานการณ์อากาศร้อน', () => {
  const s = fresh();
  core.setScenario(s, 'heatwave', true);
  s.truth.temp = 33.5;
  core.step(s, 60);
  assert.ok(s.alerts.some(a => a.key === 'temp-high'), 'ต้องมีแจ้งเตือนอุณหภูมิสูง');
});

console.log('\nCTRL-05 · การตัดสินคำสั่งขัดแย้งบนอุปกรณ์ร่วม');
t('ฝ่ายที่เบี่ยงเบนจากเป้าหมายมากกว่าเป็นผู้ชนะ และถูกบันทึกไว้', () => {
  const s = fresh();
  s.reading = { temp: 31.5, humid: 88, at: s.clock, valid: true, flags: [] }; // อุณหภูมิเบี่ยงเบนมาก
  let d = core.ruleDecide(s);
  assert.equal(d.wants.vent, true);
  assert.equal(s.arbitration[0].winner, 'temperature');
  const s2 = fresh();
  s2.reading = { temp: 28.9, humid: 96, at: s2.clock, valid: true, flags: [] }; // ความชื้นเบี่ยงเบนมาก
  d = core.ruleDecide(s2);
  assert.equal(s2.arbitration[0].winner, 'humidity');
  assert.equal(d.wants.vent, true);
});

console.log('\nAIAN-03/05 · ประตูความเชื่อมั่น');
t('คำแนะนำที่ความเชื่อมั่นต่ำกว่า 0.6 ไม่ถูกสั่งงานอัตโนมัติ', () => {
  const s = fresh();
  core.step(s, 1800);
  s.ai.autoApply = true;
  s.ai.recommendation = { device: 'fan', on: true, confidence: 0.42, reason: 'ทดสอบ', applied: false };
  s.ai.forecast = { at: s.clock, temp1h: { value: 26, lo: 25, hi: 27, band: 0.5 }, temp6h: { value: 26, lo: 24, hi: 28, band: 1 }, humid1h: { value: 84, band: 1 }, sd: 0.3, trendPerHour: 0 };
  const applied0 = s.stats.autoApplied;
  s.ai.lastRun = -1e9;
  core.step(s, 61);
  assert.equal(s.stats.autoApplied, applied0, 'ต้องไม่มีการสั่งงานอัตโนมัติเพิ่ม');
});
t('ผู้ดูแลอนุมัติคำแนะนำด้วยมือได้ และนับเป็นคำสั่งด้วยมือ', () => {
  const s = fresh();
  core.step(s, 600);
  s.ai.recommendation = { device: 'vent', on: true, confidence: 0.3, reason: 'ทดสอบ', applied: false };
  s.devices.vent.lastCommandAt = -1e9;
  const r = core.approveRecommendation(s);
  assert.equal(r.ok, true);
  assert.ok(s.devices.vent.manualUntil > s.clock);
});

console.log('\nFAIL-01 · AI ล่ม → ตัวควบคุมตามกฎยังทำงาน');
t('เมื่อ AI ไม่พร้อมใช้งาน ระบบยังคุมอุปกรณ์ตามกฎได้', () => {
  const s = fresh();
  core.setScenario(s, 'aiFail', true);
  s.truth.humid = 60;                    // ต่ำกว่าเป้าหมายมาก
  core.step(s, 300);
  assert.equal(s.ai.online, false);
  assert.equal(s.ai.recommendation, null);
  assert.equal(s.devices.humidifier.on, true, 'เครื่องเพิ่มความชื้นต้องถูกเปิดโดยกฎ');
});

console.log('\nFAIL-04 / CV-01 · กล้องล้มเหลว');
t('กล้องส่งภาพไม่ได้คุณภาพ → ข้ามรอบวิเคราะห์และแจ้งเตือน', () => {
  const s = fresh();
  core.setScenario(s, 'cameraFail', true);
  s.cv.nextCapture = s.clock + 5;
  core.step(s, 60);
  assert.equal(s.cv.skipped >= 1, true);
  assert.equal(s.cv.quality.ok, false);
  assert.ok(s.alerts.some(a => a.key === 'camera-fail'));
});
t('รอบปกติให้ผลวัดครบทุกตัวชี้วัดตามสเปก', () => {
  const s = fresh();
  core.step(s, 2000);
  const m = s.cv.metrics;
  assert.ok(m, 'ต้องมีผลวิเคราะห์');
  ['count', 'size', 'coverage', 'stage', 'harvest', 'anomalies', 'color'].forEach(k =>
    assert.ok(k in m, 'ขาดตัวชี้วัด ' + k));
  assert.ok(['pin', 'young', 'mature', 'overmature'].includes(m.stage));
});

console.log('\nSENS-03 · การเก็บข้อมูลย้อนหลัง');
t('เก็บข้อมูลดิบและค่าเฉลี่ยราย 5 นาที และไม่โตเกินขอบเขต', () => {
  const s = fresh();
  core.step(s, 6 * 3600);
  assert.ok(s.raw.length <= core.C.RAW_KEEP);
  assert.ok(s.agg.length > 20, 'ต้องมีค่าเฉลี่ยราย 5 นาที');
  assert.ok(s.agg.every(a => a.n > 0 && a.tMax >= a.tMin));
});

console.log('\nAIAN-01/02 · พยากรณ์และตรวจจับรูปแบบ');
t('พยากรณ์ 1 ชม./6 ชม. มีช่วงความเชื่อมั่น และวัด MAE ได้จริง', () => {
  const s = fresh();
  core.step(s, 3 * 3600);
  const f = s.ai.forecast;
  assert.ok(f && f.temp1h && f.temp6h);
  assert.ok(f.temp1h.hi > f.temp1h.lo);
  assert.ok(f.temp6h.band > f.temp1h.band, 'ช่วงความเชื่อมั่น 6 ชม. ต้องกว้างกว่า 1 ชม.');
  assert.ok(s.ai.accuracy.n > 0 && s.ai.accuracy.mae >= 0, 'ต้องมีการวัดความคลาดเคลื่อนจริง');
});
t('เดินระบบ 24 ชั่วโมงจำลองได้โดยไม่พัง', () => {
  const s = fresh();
  core.step(s, 24 * 3600);
  assert.ok(s.reading.temp > 0 && s.reading.temp < 50);
  assert.ok(s.reading.humid >= 0 && s.reading.humid <= 100);
  assert.ok(s.cv.cycles > 30);
  assert.ok(s.stats.acks > 0);
});

console.log('\n' + (fail ? '❌' : '✅') + ` ผ่าน ${pass} / ล้มเหลว ${fail}\n`);
process.exit(fail ? 1 : 0);
