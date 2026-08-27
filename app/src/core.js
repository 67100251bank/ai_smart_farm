/*!
 * AI Smart Mushroom Farm — core engine (simulation + safety + AI)
 * ทีม โจรสลัดพิกเซล · UP AI Hackathon 2026
 *
 * โมดูลนี้ไม่มีการอ้างถึง DOM ทำให้ทดสอบด้วย Node ได้โดยตรง
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SmartFarmCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ───────────────────────── ค่าคงที่ตาม SPEC ─────────────────────────
  var C = {
    READ_INTERVAL: 10,        // วินาที (SENS-01)
    VALID: { tMin: -10, tMax: 60, hMin: 0, hMax: 100 },   // SENS-02
    ROC: { t: 2.0, h: 10.0 }, // การเปลี่ยนแปลงสูงสุดต่อ 1 ช่วงอ่านค่า
    ACK_TIMEOUT: 5,           // CTRL-01
    MAX_RETRY: 3,
    CMD_GAP: 30,              // CTRL-04: 1 คำสั่ง/30 วินาที ต่ออุปกรณ์
    MANUAL_LOCK: 900,         // CTRL-03: 15 นาที
    ALERT_COOLDOWN: 900,      // ALRT-02: 15 นาที
    STALE: 300,               // FAIL-02: 5 นาที
    CONF_GATE: 0.6,           // AIAN-03
    CV_INTERVAL: 1800,        // CV-01: 30 นาที
    RAW_KEEP: 1080,           // ~3 ชม. ที่ 10 วินาที
    AGG_BUCKET: 300,          // ค่าเฉลี่ยราย 5 นาที
    AGG_KEEP: 576,            // ~48 ชม.
    SAFE: { fan: false, humidifier: false, vent: true } // FAIL-03 (ระบายอากาศ fail-open)
  };

  var DEVICES = [
    { id: 'fan',         name: 'พัดลม / ทำความเย็น', icon: 'fan' },
    { id: 'humidifier',  name: 'เครื่องเพิ่มความชื้น', icon: 'mist' },
    { id: 'vent',        name: 'ระบบระบายอากาศ',     icon: 'vent' }
  ];

  // ───────────────────────── สุ่มแบบกำหนด seed ได้ ─────────────────────────
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(rnd) {
    var u = 1 - rnd(), v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // ───────────────────────── สร้างสถานะเริ่มต้น ─────────────────────────
  function createState(opts) {
    opts = opts || {};
    var startClock = opts.clock != null ? opts.clock : 8 * 3600; // เริ่ม 08:00 ของวันจำลอง
    var s = {
      version: 3,
      clock: startClock,          // วินาทีในโลกจำลอง
      day: 1,
      seed: opts.seed != null ? opts.seed : 20260827,
      speed: 6,
      running: true,

      // สภาพจริงในโรงเรือน (ผู้ใช้ไม่เห็นตรง ๆ — เห็นผ่านเซนเซอร์)
      truth: { temp: 25.4, humid: 84.0 },

      // ค่าที่อ่านได้จากเซนเซอร์
      reading: { temp: 25.4, humid: 84.0, at: startClock, valid: true, flags: [] },
      sensor: { lastSeen: startClock, rejected: 0, accepted: 0, flagged: 0 },

      targets:    { tMin: 22, tMax: 28, hMin: 78, hMax: 90 },   // CTRL-06
      thresholds: { tLo: 15, tHi: 32, hLo: 60, hHi: 92 },       // ALRT-01

      devices: {},
      arbitration: [],
      commandLog: [],
      alerts: [],
      alertCooldown: {},

      safeState: { active: false, since: null, reason: '', ackRequired: false },

      ai: {
        online: true,
        pattern: [],
        forecast: null,
        recommendation: null,
        autoApply: false,
        lastRun: -1,
        accuracy: { n: 0, sumAbs: 0, mae: null },
        pending: []   // คู่ (เวลาที่พยากรณ์ถึง, ค่าที่พยากรณ์) เพื่อวัด MAE จริง
      },

      cv: {
        lastCapture: null, nextCapture: startClock + 60, cycles: 0, skipped: 0,
        metrics: null, detections: [], quality: null, history: []
      },
      growth: { goodSeconds: 0, biomass: 0.6, flush: 1 },

      role: 'operator',   // operator | admin | viewer  (SEC-02)
      scenario: { heatwave: false, sensorFail: false, actuatorFail: '', cameraFail: false, aiFail: false, doorOpen: false },

      raw: [],   // { t, temp, humid, flag }
      agg: [],   // { t, tAvg, tMin, tMax, hAvg, hMin, hMax, n }
      _aggBucket: null,
      stats: { commands: 0, acks: 0, timeouts: 0, autoApplied: 0, overrides: 0 }
    };
    DEVICES.forEach(function (d) {
      s.devices[d.id] = {
        id: d.id, on: false, desired: false, pending: false,
        retries: 0, ackDeadline: null, lastCommandAt: -1e9,
        unresponsive: false, ackRequired: false,
        manualUntil: 0, manualBy: null, source: 'auto', runSeconds: 0
      };
    });
    s._rnd = mulberry32(s.seed);
    return s;
  }

  function rehydrate(s) {
    if (!s || s.version !== 3) return null;
    s._rnd = mulberry32((s.seed || 1) + Math.floor(s.clock));
    return s;
  }

  // ───────────────────────── แบบจำลองทางกายภาพ ─────────────────────────
  function ambient(s) {
    // อุณหภูมิภายนอกแบบวัฏจักรรายวัน (พะเยา ~20–33 °C) ต่ำสุดตี 5 สูงสุดบ่าย 2
    var hr = (s.clock % 86400) / 3600;
    var base = 26.2 + 6.4 * Math.sin((2 * Math.PI * (hr - 8.5)) / 24);
    if (s.scenario.heatwave) base += 8;
    var rh = 68 - 14 * Math.sin((2 * Math.PI * (hr - 8.5)) / 24);
    return { temp: base, humid: Math.max(30, Math.min(95, rh)) };
  }

  function physics(s, dt) {
    var out = ambient(s);
    var t = s.truth.temp, h = s.truth.humid;

    // การรั่วไหลความร้อน/ความชื้นกับภายนอก (เปิดประตู/ระบายอากาศ = คูปปลิ้งแรงขึ้น)
    var tau = 2400;
    if (s.devices.vent.on) tau = 700;
    if (s.scenario.doorOpen) tau = 260;
    t += (out.temp - t) * (dt / tau);
    h += (out.humid - h) * (dt / (tau * 1.7));

    // ความร้อนจากการหายใจของก้อนเชื้อ + ความชื้นที่คายออก
    t += 0.00016 * dt;
    h += 0.00090 * dt;

    if (s.devices.fan.on)        { t -= 0.00240 * dt; h -= 0.00060 * dt; }
    if (s.devices.humidifier.on) { h += 0.00780 * dt; t -= 0.00030 * dt; }
    if (s.devices.vent.on)       { h -= 0.00230 * dt; }

    s.truth.temp = Math.max(-5, Math.min(55, t));
    s.truth.humid = Math.max(5, Math.min(99.5, h));
  }

  // ───────────────────────── การอ่านค่า + ตรวจสอบ (SENS-02) ─────────────────────────
  function readSensor(s) {
    if (s.scenario.sensorFail) return null;          // อุปกรณ์ขาดการเชื่อมต่อ
    var r = s._rnd;
    // ±0.3 °C / ±2 %RH ตามสเปก SHT31-D
    var temp = s.truth.temp + gauss(r) * 0.12;
    var humid = s.truth.humid + gauss(r) * 0.55;
    // 0.4% ของแพ็กเก็ตเป็นข้อมูลปลอม/ผิดพลาด เพื่อสาธิตการตรวจจับ (SEC-03)
    var spoofed = r() < 0.004;
    if (spoofed) { temp = 99.9 * (r() > 0.5 ? 1 : -1); }
    return { temp: temp, humid: humid, spoofed: spoofed };
  }

  function validate(s, pkt) {
    var flags = [];
    if (pkt.spoofed) flags.push('signature');
    if (pkt.temp < C.VALID.tMin || pkt.temp > C.VALID.tMax) flags.push('range-temp');
    if (pkt.humid < C.VALID.hMin || pkt.humid > C.VALID.hMax) flags.push('range-humid');
    var prev = s.reading;
    if (prev && prev.valid) {
      if (Math.abs(pkt.temp - prev.temp) > C.ROC.t) flags.push('roc-temp');
      if (Math.abs(pkt.humid - prev.humid) > C.ROC.h) flags.push('roc-humid');
    }
    return flags;
  }

  function pushHistory(s, rec) {
    s.raw.push(rec);
    if (s.raw.length > C.RAW_KEEP) s.raw.splice(0, s.raw.length - C.RAW_KEEP);
    var key = Math.floor(rec.t / C.AGG_BUCKET);
    var b = s._aggBucket;
    if (!b || b.key !== key) {
      if (b) {
        s.agg.push({ t: b.key * C.AGG_BUCKET, n: b.n,
          tAvg: b.tS / b.n, tMin: b.tMin, tMax: b.tMax,
          hAvg: b.hS / b.n, hMin: b.hMin, hMax: b.hMax });
        if (s.agg.length > C.AGG_KEEP) s.agg.splice(0, s.agg.length - C.AGG_KEEP);
      }
      b = s._aggBucket = { key: key, n: 0, tS: 0, hS: 0, tMin: 99, tMax: -99, hMin: 200, hMax: -200 };
    }
    b.n++; b.tS += rec.temp; b.hS += rec.humid;
    b.tMin = Math.min(b.tMin, rec.temp); b.tMax = Math.max(b.tMax, rec.temp);
    b.hMin = Math.min(b.hMin, rec.humid); b.hMax = Math.max(b.hMax, rec.humid);
  }

  function connection(s) {
    var age = s.clock - s.sensor.lastSeen;
    if (age <= 30) return 'online';
    if (age <= C.STALE) return 'stale';
    return 'offline';
  }

  // ───────────────────────── บริการส่งคำสั่งอุปกรณ์ ─────────────────────────
  // ทุกคำสั่ง (จากคน / กฎ / AI) ผ่านฟังก์ชันนี้เท่านั้น
  function sendCommand(s, id, on, source, opts) {
    opts = opts || {};
    var d = s.devices[id];
    if (!d) return { ok: false, reason: 'ไม่พบอุปกรณ์' };

    if (source === 'manual' && s.role === 'viewer')
      return { ok: false, reason: 'บัญชีนี้ดูข้อมูลได้อย่างเดียว (SEC-02)' };

    if (d.unresponsive && !opts.force)
      return { ok: false, reason: 'อุปกรณ์ไม่ตอบสนอง — ต้องกดรับทราบก่อน' };

    if (source !== 'manual' && d.manualUntil > s.clock)
      return { ok: false, reason: 'อยู่ในช่วงคำสั่งด้วยมือมีสิทธิ์เหนือกว่า' };

    if (source !== 'manual' && !opts.force && connection(s) === 'offline')
      return { ok: false, reason: 'ข้อมูลเซนเซอร์ค้าง — หยุดสั่งงานอัตโนมัติ' };

    if (d.on === on && !d.pending) return { ok: false, reason: 'อยู่ในสถานะที่ต้องการแล้ว', noop: true };

    if (!opts.force && s.clock - d.lastCommandAt < C.CMD_GAP)
      return { ok: false, reason: 'จำกัดความถี่คำสั่ง (1 ครั้ง/30 วินาที)', rateLimited: true };

    d.desired = on; d.pending = true; d.retries = 0;
    d.ackDeadline = s.clock + C.ACK_TIMEOUT;
    d.lastCommandAt = s.clock; d.source = source;
    if (source === 'manual') {
      d.manualUntil = s.clock + C.MANUAL_LOCK; d.manualBy = s.role;
      s.stats.overrides++;
    }
    s.stats.commands++;
    log(s, { t: s.clock, device: id, on: on, source: source, event: 'sent' });
    return { ok: true };
  }

  function log(s, entry) {
    s.commandLog.unshift(entry);
    if (s.commandLog.length > 120) s.commandLog.pop();
  }

  function updateDevices(s, dt) {
    DEVICES.forEach(function (dd) {
      var d = s.devices[dd.id];
      if (d.on) d.runSeconds += dt;
      if (!d.pending) return;
      var failing = s.scenario.actuatorFail === d.id;
      if (!failing) {                       // ตอบรับภายใน 5 วินาที
        d.on = d.desired; d.pending = false; d.ackDeadline = null; d.retries = 0;
        s.stats.acks++;
        log(s, { t: s.clock, device: d.id, on: d.on, source: d.source, event: 'ack' });
        return;
      }
      if (s.clock >= d.ackDeadline) {
        d.retries++;
        s.stats.timeouts++;
        if (d.retries >= C.MAX_RETRY) {     // FAIL-03
          d.pending = false; d.unresponsive = true; d.ackRequired = true;
          d.on = C.SAFE[d.id];
          log(s, { t: s.clock, device: d.id, on: d.on, source: 'safe-state', event: 'unresponsive' });
          raiseAlert(s, 'actuator-' + d.id, 'critical',
            dd.name + ' ไม่ตอบรับคำสั่งหลังลองซ้ำ 3 ครั้ง → เข้าสถานะปลอดภัย (' + (C.SAFE[d.id] ? 'เปิด' : 'ปิด') + ')');
          enterSafeState(s, dd.name + ' ไม่ตอบสนอง');
        } else {
          d.ackDeadline = s.clock + C.ACK_TIMEOUT;
          log(s, { t: s.clock, device: d.id, on: d.desired, source: d.source, event: 'retry-' + d.retries });
        }
      }
    });
  }

  function acknowledgeDevice(s, id) {
    var d = s.devices[id];
    if (!d) return { ok: false };
    d.unresponsive = false; d.ackRequired = false; d.retries = 0;
    d.lastCommandAt = -1e9;
    var any = DEVICES.some(function (x) { return s.devices[x.id].ackRequired; });
    if (!any && s.safeState.active && !isStale(s)) clearSafeState(s);
    log(s, { t: s.clock, device: id, source: 'operator', event: 'acknowledged' });
    return { ok: true };
  }

  function releaseManual(s, id) {
    var d = s.devices[id];
    if (d) { d.manualUntil = 0; d.manualBy = null; }
    return { ok: true };
  }

  // ───────────────────────── สถานะปลอดภัย (FAIL-02 / FAIL-03) ─────────────────────────
  function isStale(s) { return s.clock - s.sensor.lastSeen > C.STALE; }

  function enterSafeState(s, reason) {
    if (s.safeState.active) return;
    s.safeState = { active: true, since: s.clock, reason: reason, ackRequired: true };
    DEVICES.forEach(function (dd) {
      var d = s.devices[dd.id];
      d.on = C.SAFE[dd.id]; d.desired = C.SAFE[dd.id]; d.pending = false;
    });
    log(s, { t: s.clock, device: 'ทุกอุปกรณ์', source: 'safe-state', event: 'enter', on: null });
  }

  function clearSafeState(s) {
    s.safeState = { active: false, since: null, reason: '', ackRequired: false };
    log(s, { t: s.clock, device: 'ทุกอุปกรณ์', source: 'operator', event: 'resume', on: null });
  }

  function acknowledgeSafeState(s) {
    if (isStale(s)) return { ok: false, reason: 'ข้อมูลเซนเซอร์ยังค้างอยู่' };
    DEVICES.forEach(function (dd) { s.devices[dd.id].ackRequired = false; s.devices[dd.id].unresponsive = false; });
    clearSafeState(s);
    return { ok: true };
  }

  // ───────────────────────── การแจ้งเตือน (ALRT-01/02) ─────────────────────────
  function raiseAlert(s, key, level, message) {
    var last = s.alertCooldown[key];
    if (last != null && s.clock - last < C.ALERT_COOLDOWN) return false;
    s.alertCooldown[key] = s.clock;
    s.alerts.unshift({ t: s.clock, key: key, level: level, message: message, channels: ['push', 'email'] });
    if (s.alerts.length > 60) s.alerts.pop();
    return true;
  }

  function checkAlerts(s) {
    var r = s.reading, th = s.thresholds;
    if (!r.valid) return;
    if (r.temp > th.tHi) raiseAlert(s, 'temp-high', 'critical', 'อุณหภูมิสูงผิดปกติ ' + r.temp.toFixed(1) + ' °C (เกณฑ์ ' + th.tHi + ' °C)');
    else if (r.temp < th.tLo) raiseAlert(s, 'temp-low', 'critical', 'อุณหภูมิต่ำผิดปกติ ' + r.temp.toFixed(1) + ' °C (เกณฑ์ ' + th.tLo + ' °C)');
    if (r.humid > th.hHi) raiseAlert(s, 'humid-high', 'warning', 'ความชื้นสูงผิดปกติ ' + r.humid.toFixed(0) + ' %RH — เสี่ยงเชื้อรา');
    else if (r.humid < th.hLo) raiseAlert(s, 'humid-low', 'warning', 'ความชื้นต่ำผิดปกติ ' + r.humid.toFixed(0) + ' %RH — เห็ดอาจแคระ');
    var conn = connection(s);
    if (conn === 'offline') raiseAlert(s, 'sensor-offline', 'critical', 'ไม่ได้รับข้อมูลจากเซนเซอร์เกิน 5 นาที → เข้าสถานะปลอดภัย');
    else if (conn === 'stale') raiseAlert(s, 'sensor-stale', 'warning', 'ข้อมูลเซนเซอร์ค้าง — หยุดออกคำสั่งใหม่ชั่วคราว');
  }

  // ───────────────────────── ตัวควบคุมตามกฎ (FAIL-01 พร้อมใช้เสมอ) ─────────────────────────
  function deviation(v, lo, hi) {
    if (v > hi) return (v - hi) / Math.max(0.001, hi - lo);
    if (v < lo) return (lo - v) / Math.max(0.001, hi - lo);
    return 0;
  }

  function ruleDecide(s) {
    var r = s.reading, tg = s.targets;
    var wants = {};                       // อุปกรณ์ → ต้องการเปิด/ปิด
    var dbT = 0.4, dbH = 1.5;             // ฮิสเทอรีซิสกันสั่งงานถี่

    // ระบบอุณหภูมิ
    if (r.temp > tg.tMax) wants.fan = true;
    else if (r.temp < tg.tMax - dbT) wants.fan = false;

    // ระบบความชื้น
    if (r.humid < tg.hMin) wants.humidifier = true;
    else if (r.humid > tg.hMin + dbH) wants.humidifier = false;

    // อุปกรณ์ที่ใช้ร่วมกัน: ระบายอากาศ — ทั้งสองระบบแย่งกันสั่ง (CTRL-05)
    var wantVentTemp = r.temp > tg.tMax + 1.2;
    var wantVentHumid = r.humid > tg.hMax;
    var devT = deviation(r.temp, tg.tMin, tg.tMax);
    var devH = deviation(r.humid, tg.hMin, tg.hMax);
    if (wantVentTemp || wantVentHumid) {
      var winner = devT >= devH ? 'temperature' : 'humidity';
      // ถ้าความชื้นต่ำกว่าเป้าและระบบความชื้นชนะ ต้องไม่เปิดระบายอากาศ
      wants.vent = winner === 'temperature' ? true : wantVentHumid;
      pushArb(s, winner, devT, devH, wants.vent);
    } else if (r.humid < tg.hMin || r.temp < tg.tMax - dbT) {
      wants.vent = false;
    }
    return { wants: wants, devT: devT, devH: devH };
  }

  function pushArb(s, winner, devT, devH, result) {
    var last = s.arbitration[0];
    if (last && last.winner === winner && last.result === result && s.clock - last.t < 300) return;
    s.arbitration.unshift({ t: s.clock, device: 'vent', winner: winner, devT: devT, devH: devH, result: result });
    if (s.arbitration.length > 40) s.arbitration.pop();
  }

  function applyControl(s) {
    if (s.safeState.active) return;
    if (isStale(s)) return;               // FAIL-02: หยุดคำสั่งใหม่ ค้างสถานะเดิม
    var decision = ruleDecide(s);
    Object.keys(decision.wants).forEach(function (id) {
      sendCommand(s, id, decision.wants[id], s.ai.online && s.ai.autoApply ? 'ai-rule' : 'rule');
    });
    return decision;
  }

  // ───────────────────────── AI: รูปแบบ / พยากรณ์ / คำแนะนำ ─────────────────────────
  function series(s, key, n) {
    var out = [], src = s.raw;
    for (var i = Math.max(0, src.length - n); i < src.length; i++) {
      if (src[i].flag) continue;
      out.push({ t: src[i].t, v: src[i][key] });
    }
    return out;
  }

  function linreg(pts) {
    var n = pts.length; if (n < 3) return null;
    var mx = 0, my = 0;
    for (var i = 0; i < n; i++) { mx += pts[i].t; my += pts[i].v; }
    mx /= n; my /= n;
    var num = 0, den = 0, ssTot = 0;
    for (i = 0; i < n; i++) { var dx = pts[i].t - mx, dy = pts[i].v - my; num += dx * dy; den += dx * dx; ssTot += dy * dy; }
    if (den === 0) return null;
    var slope = num / den, inter = my - slope * mx, ssRes = 0;
    for (i = 0; i < n; i++) { var e = pts[i].v - (slope * pts[i].t + inter); ssRes += e * e; }
    return { slope: slope, intercept: inter, r2: ssTot ? 1 - ssRes / ssTot : 0, sd: Math.sqrt(ssRes / n), mean: my };
  }

  // Holt's linear trend (double exponential smoothing) — ตัวเลขทั้งหมดมาจากชั้นสถิติ ไม่ใช่ LLM
  function holt(pts, alpha, beta) {
    if (pts.length < 6) return null;
    var level = pts[0].v, trend = pts[1].v - pts[0].v, resid = [];
    for (var i = 1; i < pts.length; i++) {
      var f = level + trend;
      resid.push(pts[i].v - f);
      var prev = level;
      level = alpha * pts[i].v + (1 - alpha) * f;
      trend = beta * (level - prev) + (1 - beta) * trend;
    }
    var sum = 0; resid.slice(-40).forEach(function (e) { sum += e * e; });
    var sd = Math.sqrt(sum / Math.min(40, resid.length));
    return { level: level, trend: trend, sd: sd, step: (pts[pts.length - 1].t - pts[0].t) / (pts.length - 1) };
  }

  // ส่วนประกอบวัฏจักรรายวัน เรียนรู้จากค่าเฉลี่ยรายชั่วโมงย้อนหลัง
  // ต้องมีประวัติอย่างน้อย ~6 ชั่วโมง (72 บักเก็ต) จึงจะเริ่มใช้ ก่อนหน้านั้นคืน 0 (ไม่เดา)
  function diurnal(s, horizonSec, key) {
    if (s.agg.length < 72) return 0;
    var nowSlot = Math.floor((s.clock % 86400) / 3600);
    var futSlot = Math.floor(((s.clock + horizonSec) % 86400) / 3600);
    if (nowSlot === futSlot) return 0;
    var acc = {}, cnt = {};
    s.agg.forEach(function (a) {
      var sl = Math.floor((a.t % 86400) / 3600);
      var v = key === 'temp' ? a.tAvg : a.hAvg;
      acc[sl] = (acc[sl] || 0) + v; cnt[sl] = (cnt[sl] || 0) + 1;
    });
    if (!cnt[nowSlot] || !cnt[futSlot] || cnt[nowSlot] < 3 || cnt[futSlot] < 3) return 0;
    var d = (acc[futSlot] / cnt[futSlot]) - (acc[nowSlot] / cnt[nowSlot]);
    return Math.max(-9, Math.min(9, d));
  }
  function dampedSteps(k, phi) {
    if (k <= 0) return 0;
    return (phi * (1 - Math.pow(phi, k))) / (1 - phi);
  }

  function detectPatterns(s) {
    var out = [];
    var pts = series(s, 'temp', 180);           // 30 นาทีที่ 10 วินาที
    var reg = linreg(pts);
    if (reg) {
      var perHour = reg.slope * 3600;
      if (Math.abs(perHour) > 0.8 && reg.r2 > 0.45) {
        out.push({ kind: 'trend', metric: 'temp', dir: perHour > 0 ? 'up' : 'down',
          rate: perHour, confidence: Math.min(0.97, 0.5 + reg.r2 / 2),
          label: 'อุณหภูมิมีแนวโน้ม' + (perHour > 0 ? 'เพิ่มขึ้น ' : 'ลดลง ') + Math.abs(perHour).toFixed(1) + ' °C/ชม.' });
      }
      // การแกว่ง: นับการกลับทิศ + แอมพลิจูด
      var flips = 0, prevDir = 0, mn = 99, mx = -99;
      for (var i = 1; i < pts.length; i++) {
        var dir = Math.sign(pts[i].v - pts[i - 1].v);
        if (dir !== 0 && prevDir !== 0 && dir !== prevDir) flips++;
        if (dir !== 0) prevDir = dir;
        mn = Math.min(mn, pts[i].v); mx = Math.max(mx, pts[i].v);
      }
      if (pts.length > 60 && flips > 24 && mx - mn > 1.2) {
        out.push({ kind: 'oscillation', metric: 'temp', confidence: Math.min(0.95, 0.45 + flips / 120),
          label: 'อุณหภูมิแกว่ง ' + (mx - mn).toFixed(1) + ' °C ในครึ่งชั่วโมง — ตรวจการตั้งค่าเดดแบนด์' });
      }
    }
    var hp = series(s, 'humid', 180), hreg = linreg(hp);
    if (hreg && Math.abs(hreg.slope * 3600) > 4 && hreg.r2 > 0.5) {
      out.push({ kind: 'trend', metric: 'humid', dir: hreg.slope > 0 ? 'up' : 'down',
        rate: hreg.slope * 3600, confidence: Math.min(0.95, 0.5 + hreg.r2 / 2),
        label: 'ความชื้นมีแนวโน้ม' + (hreg.slope > 0 ? 'เพิ่มขึ้น ' : 'ลดลง ') + Math.abs(hreg.slope * 3600).toFixed(0) + ' %RH/ชม.' });
    }
    // ความผิดปกติเทียบวัฏจักรรายวัน
    if (s.agg.length >= 24 && reg) {
      var slot = Math.floor(((s.clock % 86400) / 3600) * 2), sum = 0, n = 0, sq = 0;
      s.agg.forEach(function (a) {
        if (Math.floor(((a.t % 86400) / 3600) * 2) === slot) { sum += a.tAvg; n++; sq += a.tAvg * a.tAvg; }
      });
      if (n >= 4) {
        var mean = sum / n, sd = Math.sqrt(Math.max(0.01, sq / n - mean * mean));
        var z = (s.reading.temp - mean) / sd;
        if (Math.abs(z) > 2.2) out.push({ kind: 'daily-anomaly', metric: 'temp', confidence: Math.min(0.95, Math.abs(z) / 4),
          label: 'อุณหภูมิต่างจากช่วงเวลาเดียวกันของวันก่อน ' + (z > 0 ? '+' : '') + (s.reading.temp - mean).toFixed(1) + ' °C' });
      }
    }
    return out;
  }

  function makeForecast(s) {
    var PHI = 0.99;                       // แนวโน้มแบบหน่วง กันการคาดการณ์เกินจริงในระยะยาว
    var pts = series(s, 'temp', 240);
    var h = holt(pts, 0.28, 0.06);
    if (!h) return null;
    // ความไม่แน่นอนอ้างอิงจากความคลาดเคลื่อนที่ "วัดได้จริง" เมื่อมีข้อมูลพอ
    var sigT = Math.max(0.45, s.ai.accuracy.mae ? s.ai.accuracy.mae * 1.25 : h.sd * 6);
    function at(sec) {
      var k = sec / Math.max(1, h.step);
      var v = h.level + h.trend * dampedSteps(k, PHI) + diurnal(s, sec, 'temp');
      var band = sigT * Math.sqrt(Math.max(0.2, sec / 3600));
      return { value: v, lo: v - band, hi: v + band, band: band };
    }
    var f1 = at(3600), f6 = at(21600);
    var curve = [];
    for (var i = 1; i <= 12; i++) {
      var sec = (21600 * i) / 12, a = at(sec);
      curve.push({ t: s.clock + sec, v: a.value, lo: a.lo, hi: a.hi });
    }
    var hp = series(s, 'humid', 240), hh = holt(hp, 0.28, 0.06);
    var fh1 = null, hcurve = [];
    if (hh) {
      var sigH = Math.max(1.6, hh.sd * 6);
      var hAt = function (sec) {
        var kk = sec / Math.max(1, hh.step);
        var vv = hh.level + hh.trend * dampedSteps(kk, PHI) + diurnal(s, sec, 'humid');
        vv = Math.max(0, Math.min(100, vv));
        var bb = sigH * Math.sqrt(Math.max(0.2, sec / 3600));
        return { value: vv, lo: Math.max(0, vv - bb), hi: Math.min(100, vv + bb), band: bb };
      };
      var h1 = hAt(3600);
      fh1 = { value: h1.value, lo: h1.lo, hi: h1.hi, band: h1.band };
      for (var j = 1; j <= 6; j++) {
        var s2 = (3600 * j) / 6, b2 = hAt(s2);
        hcurve.push({ t: s.clock + s2, v: b2.value, lo: b2.lo, hi: b2.hi });
      }
    }
    // บันทึกไว้วัดความคลาดเคลื่อนจริงเมื่อถึงเวลา
    s.ai.pending.push({ due: s.clock + 3600, predicted: f1.value });
    if (s.ai.pending.length > 400) s.ai.pending.shift();
    return { at: s.clock, temp1h: f1, temp6h: f6, humid1h: fh1, curve: curve, humidCurve: hcurve,
      sd: h.sd, diurnalReady: s.agg.length >= 72,
      trendPerHour: h.trend * dampedSteps(3600 / Math.max(1, h.step), PHI) };
  }

  function scoreForecastAccuracy(s) {
    var keep = [];
    s.ai.pending.forEach(function (p) {
      if (s.clock >= p.due) {
        s.ai.accuracy.n++;
        s.ai.accuracy.sumAbs += Math.abs(s.reading.temp - p.predicted);
        s.ai.accuracy.mae = s.ai.accuracy.sumAbs / s.ai.accuracy.n;
      } else keep.push(p);
    });
    s.ai.pending = keep;
  }

  function recommend(s) {
    var f = s.ai.forecast, tg = s.targets, r = s.reading;
    if (!f) return null;
    var cands = [];
    var willExceed = f.temp1h.value > tg.tMax + 0.3;
    var willDrop = f.temp1h.value < tg.tMin - 0.3;
    // ความเชื่อมั่น: ยิ่งช่วงความเชื่อมั่นแคบ และยิ่งเบี่ยงเบนชัด ยิ่งมั่นใจ
    function conf(margin, band) {
      var c = 1 - Math.exp(-Math.abs(margin) / Math.max(0.35, band));
      return Math.max(0.15, Math.min(0.96, c));
    }
    if (willExceed) {
      cands.push({ device: 'fan', on: true, target: tg.tMax - 0.5,
        confidence: conf(f.temp1h.value - tg.tMax, f.temp1h.band),
        reason: 'พยากรณ์อีก 1 ชม. อุณหภูมิจะขึ้นถึง ' + f.temp1h.value.toFixed(1) + ' °C ซึ่งเกินเป้าหมาย ' + tg.tMax + ' °C — เปิดพัดลมล่วงหน้าเพื่อไม่ให้เกินเกณฑ์' });
    }
    if (willDrop) {
      cands.push({ device: 'fan', on: false, target: tg.tMin + 0.5,
        confidence: conf(tg.tMin - f.temp1h.value, f.temp1h.band),
        reason: 'พยากรณ์อีก 1 ชม. อุณหภูมิจะลดถึง ' + f.temp1h.value.toFixed(1) + ' °C ต่ำกว่าเป้าหมาย — ปิดพัดลมเพื่อรักษาความอบอุ่น' });
    }
    if (f.humid1h && f.humid1h.value < tg.hMin - 1) {
      cands.push({ device: 'humidifier', on: true, target: tg.hMin + 3,
        confidence: conf(tg.hMin - f.humid1h.value, f.humid1h.band),
        reason: 'พยากรณ์ความชื้นจะลดถึง ' + f.humid1h.value.toFixed(0) + ' %RH ต่ำกว่าเป้าหมาย ' + tg.hMin + ' %RH — เดินเครื่องเพิ่มความชื้นก่อนเห็ดหยุดโต' });
    }
    if (f.humid1h && f.humid1h.value > tg.hMax + 1) {
      cands.push({ device: 'vent', on: true, target: tg.hMax - 2,
        confidence: conf(f.humid1h.value - tg.hMax, f.humid1h.band),
        reason: 'พยากรณ์ความชื้นจะขึ้นถึง ' + f.humid1h.value.toFixed(0) + ' %RH เสี่ยงเชื้อรา — ระบายอากาศเพื่อลดความชื้น' });
    }
    if (!cands.length) {
      return { device: null, on: null, confidence: Math.max(0.2, Math.min(0.95, 1 - f.temp1h.band / 3)),
        action: 'hold', reason: 'ค่าปัจจุบัน ' + r.temp.toFixed(1) + ' °C / ' + r.humid.toFixed(0) + ' %RH และแนวโน้ม 1 ชม. ยังอยู่ในช่วงเป้าหมาย — ไม่ต้องปรับ',
        applied: false, at: s.clock };
    }
    cands.sort(function (a, b) { return b.confidence - a.confidence; });
    var top = cands[0];
    top.action = (top.on ? 'เปิด' : 'ปิด') + ' ' + deviceName(top.device);
    top.applied = false; top.at = s.clock;
    return top;
  }

  function deviceName(id) {
    var d = DEVICES.filter(function (x) { return x.id === id; })[0];
    return d ? d.name : id;
  }

  function runAI(s) {
    if (!s.ai.online) { s.ai.pattern = []; s.ai.forecast = null; s.ai.recommendation = null; return; }
    s.ai.pattern = detectPatterns(s);
    s.ai.forecast = makeForecast(s);
    var rec = recommend(s);
    // เก็บสถานะ "อนุมัติแล้ว" ของคำแนะนำเดิมถ้าเป็นข้อเดียวกัน
    var old = s.ai.recommendation;
    if (old && rec && old.device === rec.device && old.on === rec.on && old.applied) rec.applied = true;
    s.ai.recommendation = rec;
    s.ai.lastRun = s.clock;

    // AIAN-03/05: ต่ำกว่าเกณฑ์ความเชื่อมั่นห้ามสั่งงานเอง ไม่ว่าโหมดใด
    if (rec && rec.device && s.ai.autoApply && rec.confidence >= C.CONF_GATE && !rec.applied) {
      var res = sendCommand(s, rec.device, rec.on, 'ai');
      if (res.ok) { rec.applied = true; s.stats.autoApplied++; }
    }
  }

  function approveRecommendation(s) {
    var rec = s.ai.recommendation;
    if (!rec || !rec.device) return { ok: false, reason: 'ไม่มีคำแนะนำที่ต้องอนุมัติ' };
    if (s.role === 'viewer') return { ok: false, reason: 'บัญชีนี้ดูข้อมูลได้อย่างเดียว' };
    var res = sendCommand(s, rec.device, rec.on, 'manual');
    if (res.ok) rec.applied = true;
    return res;
  }

  // ───────────────────────── Computer Vision (จำลอง) ─────────────────────────
  function cvCycle(s) {
    var wasHarvestReady = !!(s.cv.metrics && s.cv.metrics.harvest);
    s.cv.nextCapture = s.clock + C.CV_INTERVAL;
    var r = s._rnd;
    if (s.scenario.cameraFail) {           // FAIL-04
      s.cv.skipped++;
      s.cv.quality = { ok: false, brightness: 4 + r() * 6, blur: 0.8 + r() * 0.2, note: 'ภาพมืด/เบลอเกินเกณฑ์' };
      raiseAlert(s, 'camera-fail', 'warning', 'กล้องส่งภาพไม่ได้คุณภาพ — ข้ามการวิเคราะห์รอบนี้ (' + s.cv.skipped + ' รอบต่อเนื่อง)');
      return;
    }
    s.cv.quality = { ok: true, brightness: 118 + r() * 40, blur: 0.05 + r() * 0.08, note: 'ผ่านเกณฑ์ความสว่างและความคมชัด' };
    s.cv.cycles++; s.cv.skipped = 0;
    s.cv.lastCapture = s.clock;

    var b = s.growth.biomass;
    var count = Math.max(3, Math.round(b * 26 + gauss(r) * 1.2));
    var size = Math.max(0.6, b * 7.4 + gauss(r) * 0.18);
    var coverage = Math.max(2, Math.min(96, b * 74 + gauss(r) * 1.5));
    var stage = size < 2 ? 'pin' : size < 4 ? 'young' : size < 7 ? 'mature' : 'overmature';
    var stageTh = { pin: 'ระยะดอกเข็ม', young: 'ระยะอ่อน', mature: 'ระยะโตเต็มที่', overmature: 'ระยะแก่เกิน' }[stage];
    var harvest = (stage === 'mature' && size >= 4.6) || stage === 'overmature';

    // ความผิดปกติสัมพันธ์กับสภาพแวดล้อมที่ผ่านมา
    var anomalies = [];
    if (s.reading.humid > 92) anomalies.push({ cls: 'mold', label: 'เชื้อราขึ้นผิวดอก', p: Math.min(0.94, 0.35 + (s.reading.humid - 92) * 0.09) });
    if (s.reading.humid < 68) anomalies.push({ cls: 'stunted', label: 'ดอกแคระ/แตกลาย', p: Math.min(0.9, 0.3 + (68 - s.reading.humid) * 0.05) });
    if (s.reading.temp > 31) anomalies.push({ cls: 'discolor', label: 'สีผิดปกติจากความร้อน', p: Math.min(0.9, 0.28 + (s.reading.temp - 31) * 0.1) });
    if (stage === 'overmature') anomalies.push({ cls: 'rot', label: 'เริ่มเน่าเพราะเก็บช้า', p: 0.55 });

    var dets = [];
    for (var i = 0; i < count; i++) {
      var rr = 0.30 + (size / 8) * (0.44 + r() * 0.42);
      dets.push({ x: 0.07 + r() * 0.86, y: 0.14 + r() * 0.76, r: rr,
        stage: stage, conf: 0.74 + r() * 0.24,
        bad: anomalies.length && r() < Math.min(0.35, anomalies[0].p * 0.4) });
    }
    s.cv.metrics = { count: count, size: size, coverage: coverage, stage: stage, stageTh: stageTh,
      harvest: harvest, anomalies: anomalies, at: s.clock,
      color: s.reading.temp > 31 ? 'เหลืองคล้ำ' : 'ครีมอมเทา (ปกติ)' };
    s.cv.detections = dets;
    s.cv.history.push({ t: s.clock, count: count, size: size, coverage: coverage });
    if (s.cv.history.length > 240) s.cv.history.shift();

    if (harvest && !wasHarvestReady)
      raiseAlert(s, 'harvest', 'good', 'เห็ดถึงเกณฑ์พร้อมเก็บเกี่ยว (ขนาดเฉลี่ย ' + size.toFixed(1) + ' ซม.) — แนะนำให้เก็บภายในวันนี้');
    if (anomalies.length && anomalies[0].p > 0.6)
      raiseAlert(s, 'cv-anomaly-' + anomalies[0].cls, 'warning', 'ตรวจพบความผิดปกติ: ' + anomalies[0].label + ' (ความเชื่อมั่น ' + Math.round(anomalies[0].p * 100) + '%)');
  }

  function harvestNow(s) {
    if (!s.cv.metrics) return { ok: false, reason: 'ยังไม่มีผลวิเคราะห์ภาพ' };
    s.growth.biomass = 0.08; s.growth.flush++; s.growth.goodSeconds = 0;
    s.cv.metrics = null; s.cv.detections = []; s.cv.history = [];
    s.cv.nextCapture = s.clock + 60;
    raiseAlert(s, 'harvested', 'good', 'บันทึกการเก็บเกี่ยวรุ่นที่ ' + (s.growth.flush - 1) + ' เรียบร้อย — เริ่มรอบใหม่');
    return { ok: true };
  }

  function growthUpdate(s, dt) {
    var r = s.reading, tg = s.targets;
    var inRange = r.valid && r.temp >= tg.tMin - 1 && r.temp <= tg.tMax + 1 && r.humid >= tg.hMin - 3 && r.humid <= tg.hMax + 3;
    if (inRange) {
      s.growth.goodSeconds += dt;
      s.growth.biomass = Math.min(1.25, s.growth.biomass + dt * 3.4e-6);
    } else {
      s.growth.biomass = Math.min(1.25, s.growth.biomass + dt * 0.6e-6);
    }
  }

  // ───────────────────────── ลูปหลัก ─────────────────────────
  function step(s, dtSim) {
    var remaining = dtSim;
    var guard = 0;
    while (remaining > 0.0001 && guard++ < 200000) {
      var dt = Math.min(C.READ_INTERVAL, remaining);
      remaining -= dt;
      s.clock += dt;
      s.day = 1 + Math.floor(s.clock / 86400);

      physics(s, dt);

      var pkt = readSensor(s);
      if (pkt) {
        var flags = validate(s, pkt);
        var bad = flags.length > 0;
        if (flags.indexOf('signature') >= 0 || flags.indexOf('range-temp') >= 0 || flags.indexOf('range-humid') >= 0) {
          s.sensor.rejected++;              // ปฏิเสธ แต่ยังนับว่าอุปกรณ์ยังติดต่อได้
          s.sensor.lastSeen = s.clock;
        } else {
          s.sensor.accepted++;
          if (bad) s.sensor.flagged++;
          s.reading = { temp: pkt.temp, humid: pkt.humid, at: s.clock, valid: true, flags: flags };
          s.sensor.lastSeen = s.clock;
          pushHistory(s, { t: s.clock, temp: pkt.temp, humid: pkt.humid, flag: bad ? 1 : 0 });
        }
      }

      updateDevices(s, dt);
      if (isStale(s) && !s.safeState.active && s.clock - s.sensor.lastSeen > C.STALE) {
        enterSafeState(s, 'ข้อมูลเซนเซอร์ค้างเกิน 5 นาที');
      }
      checkAlerts(s);
      applyControl(s);
      growthUpdate(s, dt);
      scoreForecastAccuracy(s);

      if (s.scenario.aiFail) s.ai.online = false;
      else if (!s.ai.online) { s.ai.online = true; }

      if (s.clock - s.ai.lastRun >= 60) runAI(s);
      if (s.clock >= s.cv.nextCapture) cvCycle(s);
    }
    return s;
  }

  function setScenario(s, key, value) {
    s.scenario[key] = value;
    if (key === 'sensorFail' && !value) s.sensor.lastSeen = s.clock;
    if (key === 'aiFail') s.ai.online = !value;
    if (key === 'cameraFail' && !value) s.cv.nextCapture = s.clock + 5;
    return s;
  }

  function setTargets(s, patch) {
    var t = Object.assign({}, s.targets, patch);
    var errs = [];
    if (t.tMin >= t.tMax) errs.push('อุณหภูมิต่ำสุดต้องน้อยกว่าสูงสุด');
    if (t.hMin >= t.hMax) errs.push('ความชื้นต่ำสุดต้องน้อยกว่าสูงสุด');
    if (t.hMin < 50 || t.hMax > 95) errs.push('ช่วงความชื้นเป้าหมายต้องอยู่ใน 50–95 %RH');   // CTRL-06
    if (t.tMin < 10 || t.tMax > 35) errs.push('ช่วงอุณหภูมิเป้าหมายต้องอยู่ใน 10–35 °C');
    if (errs.length) return { ok: false, errors: errs };
    s.targets = t;
    return { ok: true };
  }

  function fmtClock(sec) {
    var d = Math.floor(sec / 86400) + 1, r = sec % 86400;
    var h = Math.floor(r / 3600), m = Math.floor((r % 3600) / 60);
    return { day: d, hhmm: String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') };
  }

  function statusOf(v, lo, hi, hardLo, hardHi) {
    if (v < hardLo || v > hardHi) return 'critical';
    if (v < lo || v > hi) return 'warning';
    return 'good';
  }

  return {
    C: C, DEVICES: DEVICES,
    createState: createState, rehydrate: rehydrate, step: step,
    sendCommand: sendCommand, acknowledgeDevice: acknowledgeDevice, releaseManual: releaseManual,
    acknowledgeSafeState: acknowledgeSafeState, approveRecommendation: approveRecommendation,
    setScenario: setScenario, setTargets: setTargets, harvestNow: harvestNow,
    connection: connection, isStale: isStale, ruleDecide: ruleDecide, runAI: runAI,
    series: series, linreg: linreg, holt: holt, fmtClock: fmtClock, statusOf: statusOf,
    deviceName: deviceName, ambient: ambient, cvCycle: cvCycle, raiseAlert: raiseAlert,
    enterSafeState: enterSafeState
  };
});
