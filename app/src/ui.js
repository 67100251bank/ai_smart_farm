/* AI Smart Mushroom Farm — ส่วนติดต่อผู้ใช้ (มือถือเป็นหลัก) */
(function () {
  'use strict';
  var Core = window.SmartFarmCore;
  var KEY = 'smartfarm.v3';

  var I = {
    thermo: '<path d="M14 14.8V4a2 2 0 1 0-4 0v10.8a4 4 0 1 0 4 0Z"/><path d="M12 9v6"/>',
    drop: '<path d="M12 2.7 6.9 8.5a7 7 0 1 0 10.2 0L12 2.7Z"/>',
    fan: '<path d="M12 12c2.8 0 3-4.2 1.6-6.4C12.6 4 10 4.3 10 6.4c0 2 2 3.4 2 5.6Z"/><path d="M12 12c0 2.8 4.2 3 6.4 1.6 1.6-1 1.3-3.6-.8-3.6-2 0-3.4 2-5.6 2Z"/><path d="M12 12c-2.8 0-3 4.2-1.6 6.4 1 1.6 3.6 1.3 3.6-.8 0-2-2-3.4-2-5.6Z"/><path d="M12 12c0-2.8-4.2-3-6.4-1.6C4 11.4 4.3 14 6.4 14c2 0 3.4-2 5.6-2Z"/>',
    mist: '<path d="M4 15h6M13 15h7M6 18.5h5M14 18.5h4"/><path d="M12 3.5c-2.4 2.8-3.6 4.7-3.6 6.2a3.6 3.6 0 0 0 7.2 0c0-1.5-1.2-3.4-3.6-6.2Z"/>',
    vent: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M6.5 8.5h11M6.5 12h11M6.5 15.5h11"/>',
    chart: '<path d="M4 19V5M4 19h16"/><path d="M7.5 15.5l3.5-4.5 3 2.5L20 7"/>',
    sliders: '<path d="M5 5v6M5 15v4M12 5v3M12 12v7M19 5v9M19 18v1"/><circle cx="5" cy="13" r="2"/><circle cx="12" cy="10" r="2"/><circle cx="19" cy="16" r="2"/>',
    brain: '<path d="M9.5 4.5A3 3 0 0 0 6.6 7 2.6 2.6 0 0 0 5 9.4c0 .8.3 1.5.9 2a2.7 2.7 0 0 0 .2 3.6c.4.4.9.7 1.5.8.3 1.4 1.6 2.4 3.1 2.4h.3V4.6a2 2 0 0 0-1.5 0Z"/><path d="M14.5 4.5A3 3 0 0 1 17.4 7 2.6 2.6 0 0 1 19 9.4c0 .8-.3 1.5-.9 2a2.7 2.7 0 0 1-.2 3.6c-.4.4-.9.7-1.5.8-.3 1.4-1.6 2.4-3.1 2.4H13V4.6a2 2 0 0 1 1.5 0Z"/>',
    mush: '<path d="M4.2 11.2c0-4 3.5-6.7 7.8-6.7s7.8 2.7 7.8 6.7c0 .9-.7 1.4-1.7 1.4H5.9c-1 0-1.7-.5-1.7-1.4Z"/><path d="M10 12.6c0 3.6-.4 5.1-1 6.2.9.5 5.1.5 6 0-.6-1.1-1-2.6-1-6.2"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3.1 15H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4.1V4a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.4 1Z"/>',
    play: '<path d="M7 4.5v15l13-7.5-13-7.5Z" fill="currentColor" stroke="none"/>',
    pause: '<path d="M8 5h3v14H8zM13 5h3v14h-3z" fill="currentColor" stroke="none"/>',
    warn: '<path d="M12 3.6 2.6 20h18.8L12 3.6Z"/><path d="M12 9.5v5M12 17.2v.2"/>',
    shield: '<path d="M12 3.2 5 5.8v5.4c0 4 2.9 7.7 7 9.6 4.1-1.9 7-5.6 7-9.6V5.8L12 3.2Z"/><path d="M9 12.2l2.2 2.2L15.2 10"/>',
    bell: '<path d="M18 15.5V10a6 6 0 1 0-12 0v5.5L4.5 18h15L18 15.5Z"/><path d="M10 21h4"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    wifi: '<path d="M4.5 9.5a11 11 0 0 1 15 0M7.5 13a7 7 0 0 1 9 0"/><path d="M12 16.8v.2"/>',
    camera: '<path d="M3.5 8.5h3l1.5-2h8l1.5 2h3v10h-17z"/><circle cx="12" cy="13" r="3.2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.4 5.4l1.4 1.4M17.2 17.2l1.4 1.4M18.6 5.4l-1.4 1.4M6.8 17.2l-1.4 1.4"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>'
  };
  function ico(name, cls) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"' +
      (cls ? ' class="' + cls + '"' : '') + ' aria-hidden="true">' + I[name] + '</svg>';
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  function hhmm(sec) { var f = Core.fmtClock(sec); return f.hhmm; }

  // ───────────────────────── สถานะแอป ─────────────────────────
  var S = null;
  var view = 'monitor';
  var win = 10800;
  var showTable = false;
  var hover = {};
  var toast = null, toastAt = 0;
  var sheetOpen = false;
  var exportOpen = false;
  var lastSeenAlerts = 0;
  var formErr = '';

  function save() {
    try {
      var c = JSON.parse(JSON.stringify(S, function (k, v) { return k === '_rnd' ? undefined : v; }));
      localStorage.setItem(KEY, JSON.stringify(c));
    } catch (e) { /* โหมดส่วนตัว/พื้นที่เต็ม — ข้ามได้ */ }
  }
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      return Core.rehydrate(JSON.parse(raw));
    } catch (e) { return null; }
  }
  function say(msg, kind) { toast = { msg: msg, kind: kind || 'info' }; toastAt = performance.now(); render(); }

  // ───────────────────────── กราฟเส้น ─────────────────────────
  function pickSeries(key) {
    var now = S.clock, from = now - win, pts = [];
    if (win <= 10800) {
      S.raw.forEach(function (r) { if (r.t >= from) pts.push({ t: r.t, v: r[key] }); });
      if (pts.length > 400) {
        var st = Math.ceil(pts.length / 400), o = [];
        for (var i = 0; i < pts.length; i += st) o.push(pts[i]);
        o.push(pts[pts.length - 1]); pts = o;
      }
    } else {
      S.agg.forEach(function (a) { if (a.t >= from) pts.push({ t: a.t, v: key === 'temp' ? a.tAvg : a.hAvg }); });
      if (S.raw.length) { var last = S.raw[S.raw.length - 1]; pts.push({ t: last.t, v: last[key] }); }
    }
    return pts;
  }

  function drawChart(cv, cfg) {
    var dpr = Math.min(2.5, window.devicePixelRatio || 1);
    var w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    var x = cv.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, w, h);

    var padL = 6, padR = 40, padT = 10, padB = 20;
    var pts = cfg.points;
    if (!pts.length) {
      x.fillStyle = css('--ink-3'); x.font = '12px ' + css('--font-body');
      x.fillText('กำลังเก็บข้อมูล…', 8, h / 2); return;
    }
    var fc = cfg.forecast || [];
    var t0 = pts[0].t, t1 = (fc.length ? fc[fc.length - 1].t : pts[pts.length - 1].t);
    if (t1 <= t0) t1 = t0 + 60;
    var vals = pts.map(function (p) { return p.v; });
    fc.forEach(function (f) { vals.push(f.lo, f.hi); });
    if (cfg.band) { vals.push(cfg.band.lo, cfg.band.hi); }
    var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
    var pad = Math.max(cfg.minSpan || 1, (mx - mn)) * 0.14;
    mn -= pad; mx += pad;
    if (cfg.clamp) { mn = Math.max(cfg.clamp[0], mn); mx = Math.min(cfg.clamp[1], mx); }

    var X = function (t) { return padL + ((t - t0) / (t1 - t0)) * (w - padL - padR); };
    var Y = function (v) { return padT + (1 - (v - mn) / (mx - mn)) * (h - padT - padB); };

    // แถบช่วงเป้าหมาย + เส้นขอบเขต
    if (cfg.band) {
      x.fillStyle = css('--band');
      x.fillRect(padL, Y(cfg.band.hi), w - padL - padR, Math.max(1, Y(cfg.band.lo) - Y(cfg.band.hi)));
      x.strokeStyle = css('--ink-3'); x.lineWidth = 1; x.setLineDash([2, 4]); x.globalAlpha = .55;
      [cfg.band.lo, cfg.band.hi].forEach(function (v) {
        var yy = Math.round(Y(v)) + .5;
        x.beginPath(); x.moveTo(padL, yy); x.lineTo(w - padR, yy); x.stroke();
      });
      x.globalAlpha = 1; x.setLineDash([]);
    }
    // เส้นกริด + ป้ายแกน
    x.strokeStyle = css('--grid'); x.lineWidth = 1;
    x.fillStyle = css('--ink-3'); x.font = '10px ' + css('--font-mono'); x.textAlign = 'left';
    for (var g = 0; g <= 3; g++) {
      var vv = mn + ((mx - mn) * g) / 3, yy = Math.round(Y(vv)) + .5;
      x.beginPath(); x.moveTo(padL, yy); x.lineTo(w - padR, yy); x.stroke();
      x.fillText(vv.toFixed(cfg.dec != null ? cfg.dec : 1), w - padR + 5, yy + 3.5);
    }
    // ป้ายเวลา
    x.textAlign = 'center';
    for (var k = 0; k <= 3; k++) {
      var tt = t0 + ((t1 - t0) * k) / 3;
      x.fillText(hhmm(tt), Math.min(w - padR - 8, Math.max(16, X(tt))), h - 5);
    }
    // เส้นแบ่ง "ตอนนี้"
    if (fc.length) {
      var nx = X(S.clock);
      x.strokeStyle = css('--line'); x.setLineDash([3, 4]);
      x.beginPath(); x.moveTo(nx, padT); x.lineTo(nx, h - padB); x.stroke();
      x.setLineDash([]);
    }
    // พื้นที่ใต้เส้น (ไล่เฉดจนโปร่งใส เพื่อไม่กลบแถบเป้าหมาย)
    var col = cfg.color, fill = cfg.fill;
    var topY = Math.min.apply(null, pts.map(function (p) { return Y(p.v); }));
    var grad = x.createLinearGradient(0, topY, 0, h - padB);
    grad.addColorStop(0, fill); grad.addColorStop(1, 'rgba(0,0,0,0)');
    x.beginPath(); x.moveTo(X(pts[0].t), Y(pts[0].v));
    pts.forEach(function (p) { x.lineTo(X(p.t), Y(p.v)); });
    x.lineTo(X(pts[pts.length - 1].t), h - padB); x.lineTo(X(pts[0].t), h - padB); x.closePath();
    x.fillStyle = grad; x.fill();
    // เส้นข้อมูล
    x.beginPath(); x.moveTo(X(pts[0].t), Y(pts[0].v));
    pts.forEach(function (p) { x.lineTo(X(p.t), Y(p.v)); });
    x.strokeStyle = col; x.lineWidth = 2; x.lineJoin = 'round'; x.stroke();
    // ช่วงความเชื่อมั่นของการพยากรณ์
    if (fc.length) {
      x.beginPath();
      x.moveTo(X(fc[0].t), Y(fc[0].hi));
      fc.forEach(function (f) { x.lineTo(X(f.t), Y(f.hi)); });
      for (var i = fc.length - 1; i >= 0; i--) x.lineTo(X(fc[i].t), Y(fc[i].lo));
      x.closePath(); x.fillStyle = fill; x.fill();
      x.beginPath(); x.moveTo(X(pts[pts.length - 1].t), Y(pts[pts.length - 1].v));
      fc.forEach(function (f) { x.lineTo(X(f.t), Y(f.v)); });
      x.strokeStyle = col; x.lineWidth = 2; x.setLineDash([5, 4]); x.stroke(); x.setLineDash([]);
    }
    // จุดปลายเน้น
    var lp = pts[pts.length - 1];
    x.beginPath(); x.arc(X(lp.t), Y(lp.v), 4, 0, 7); x.fillStyle = col; x.fill();
    x.lineWidth = 2; x.strokeStyle = css('--surface'); x.stroke();

    // เส้นชี้ตำแหน่ง
    var hv = hover[cfg.id];
    if (hv != null) {
      var idx = 0, best = 1e12;
      pts.forEach(function (p, i) { var d = Math.abs(X(p.t) - hv); if (d < best) { best = d; idx = i; } });
      var p2 = pts[idx];
      x.strokeStyle = css('--ink-3'); x.lineWidth = 1; x.setLineDash([2, 3]);
      x.beginPath(); x.moveTo(X(p2.t), padT); x.lineTo(X(p2.t), h - padB); x.stroke(); x.setLineDash([]);
      x.beginPath(); x.arc(X(p2.t), Y(p2.v), 5, 0, 7); x.fillStyle = col; x.fill();
      x.lineWidth = 2; x.strokeStyle = css('--surface'); x.stroke();
      var tip = document.getElementById('tip-' + cfg.id);
      if (tip) {
        tip.className = 'tip on';
        tip.style.left = Math.min(w - 130, Math.max(0, X(p2.t) - 60)) + 'px';
        tip.style.top = Math.max(0, Y(p2.v) - 54) + 'px';
        tip.innerHTML = '<div class="tt">วันที่ ' + Core.fmtClock(p2.t).day + ' · ' + hhmm(p2.t) + '</div>' +
          '<div class="tr"><span>' + cfg.label + '</span><b style="color:' + col + '">' + p2.v.toFixed(cfg.dec != null ? cfg.dec : 1) + ' ' + cfg.unit + '</b></div>';
      }
    } else {
      var tip2 = document.getElementById('tip-' + cfg.id);
      if (tip2) tip2.className = 'tip';
    }
  }

  function drawSpark(cv, key, color) {
    var dpr = Math.min(2.5, window.devicePixelRatio || 1);
    var w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    cv.width = w * dpr; cv.height = h * dpr;
    var x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h);
    var from = S.clock - 1800, pts = [];
    S.raw.forEach(function (r) { if (r.t >= from) pts.push({ t: r.t, v: r[key] }); });
    if (pts.length < 3) return;
    var vs = pts.map(function (p) { return p.v; });
    var mn = Math.min.apply(null, vs), mx = Math.max.apply(null, vs);
    if (mx - mn < 0.6) { var c = (mx + mn) / 2; mn = c - 0.3; mx = c + 0.3; }
    var X = function (t) { return ((t - pts[0].t) / Math.max(1, pts[pts.length - 1].t - pts[0].t)) * w; };
    var Y = function (v) { return 4 + (1 - (v - mn) / (mx - mn)) * (h - 10); };
    x.beginPath(); x.moveTo(0, h);
    pts.forEach(function (p) { x.lineTo(X(p.t), Y(p.v)); });
    x.lineTo(w, h); x.closePath();
    x.fillStyle = key === 'temp' ? css('--temp-fill') : css('--humid-fill'); x.fill();
    x.beginPath(); x.moveTo(X(pts[0].t), Y(pts[0].v));
    pts.forEach(function (p) { x.lineTo(X(p.t), Y(p.v)); });
    x.strokeStyle = color; x.lineWidth = 1.8; x.stroke();
    var lp = pts[pts.length - 1];
    x.beginPath(); x.arc(X(lp.t), Y(lp.v), 2.8, 0, 7); x.fillStyle = color; x.fill();
  }

  // ───────────────────────── ภาพจำลองจากกล้อง ─────────────────────────
  function drawCV(cv) {
    var w = cv.clientWidth, h = Math.round(w * 3 / 4);
    var dpr = Math.min(2.2, window.devicePixelRatio || 1);
    cv.width = w * dpr; cv.height = h * dpr;
    var x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
    // พื้นก้อนเชื้อ
    var g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#3a3128'); g.addColorStop(1, '#221d18');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    var rnd = (function (a) { return function () { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; }; })(9137);
    for (var i = 0; i < 900; i++) {
      x.fillStyle = 'rgba(' + (90 + rnd() * 60 | 0) + ',' + (78 + rnd() * 50 | 0) + ',' + (62 + rnd() * 40 | 0) + ',' + (0.06 + rnd() * 0.16) + ')';
      x.fillRect(rnd() * w, rnd() * h, 1.6 + rnd() * 2.6, 1.2 + rnd() * 2);
    }
    if (!S.cv.metrics) {
      x.fillStyle = 'rgba(255,255,255,.72)'; x.font = '600 13px ' + css('--font-body');
      x.textAlign = 'center';
      x.fillText(S.cv.quality && !S.cv.quality.ok ? 'ภาพไม่ผ่านเกณฑ์คุณภาพ — ข้ามรอบนี้' : 'ยังไม่มีภาพวิเคราะห์', w / 2, h / 2);
      return;
    }
    var dets = S.cv.detections;
    var cap = css('--ink') && false; // (ไม่ใช้โทเคนธีมในภาพ เพื่อให้ภาพคงที่ทั้งสองธีม)
    dets.forEach(function (d) {
      var cx = d.x * w, cy = d.y * h, r = d.r * (w / 12);
      // ก้าน
      x.fillStyle = 'rgba(226,219,203,.80)';
      x.beginPath(); x.ellipse(cx, cy + r * 0.75, r * 0.30, r * 0.62, 0, 0, 7); x.fill();
      // หมวกเห็ด
      var cg = x.createRadialGradient(cx - r * .3, cy - r * .5, r * .15, cx, cy, r * 1.25);
      if (d.bad) { cg.addColorStop(0, '#cdbba0'); cg.addColorStop(1, '#6c5f4c'); }
      else { cg.addColorStop(0, '#f2ece0'); cg.addColorStop(1, '#a99b86'); }
      x.fillStyle = cg;
      x.beginPath(); x.ellipse(cx, cy, r * 1.12, r * 0.80, 0, Math.PI, 0); x.fill();
      x.beginPath(); x.ellipse(cx, cy, r * 1.12, r * 0.30, 0, 0, Math.PI); x.fill();
    });
    // กรอบตรวจจับ + ป้าย
    dets.forEach(function (d, i) {
      var cx = d.x * w, cy = d.y * h, r = d.r * (w / 12);
      var bx = cx - r * 1.3, by = cy - r * 1.0, bw = r * 2.6, bh = r * 2.5;
      x.strokeStyle = d.bad ? '#F0796B' : '#5CC2D4';
      x.lineWidth = 1.4; x.setLineDash([]);
      x.strokeRect(bx, by, bw, bh);
      if (i < 6) {
        var lab = (d.bad ? 'anomaly ' : d.stage + ' ') + d.conf.toFixed(2);
        x.font = '9px ' + css('--font-mono');
        var tw = x.measureText(lab).width + 6;
        x.fillStyle = d.bad ? 'rgba(240,121,107,.92)' : 'rgba(92,194,212,.92)';
        x.fillRect(bx, by - 12, tw, 12);
        x.fillStyle = '#0b1412'; x.textAlign = 'left';
        x.fillText(lab, bx + 3, by - 3);
      }
    });
    // แสงจากมุมกล้อง
    var vg = x.createRadialGradient(w * .5, h * .35, w * .1, w * .5, h * .5, w * .78);
    vg.addColorStop(0, 'rgba(255,255,255,.06)'); vg.addColorStop(1, 'rgba(0,0,0,.42)');
    x.fillStyle = vg; x.fillRect(0, 0, w, h);
  }

  // ───────────────────────── ส่วนประกอบ ─────────────────────────
  function statusPill(kind, text, icon) {
    return '<span class="pill ' + kind + '">' + (icon ? ico(icon) : '<i class="dot"></i>') + esc(text) + '</span>';
  }
  function confBar(c) {
    var low = c < Core.C.CONF_GATE;
    return '<div class="conf"><div class="conf-bar"><i class="' + (low ? 'low' : '') + '" style="width:' + Math.round(c * 100) + '%"></i></div>' +
      '<div class="conf-note"><span class="gate">ความเชื่อมั่น ' + (c * 100).toFixed(0) + '%</span> · ' +
      (low ? 'ต่ำกว่าเกณฑ์ 60% → ระบบจะไม่สั่งงานเอง ต้องให้ผู้ดูแลอนุมัติ' : 'ผ่านเกณฑ์ 60% → สั่งงานอัตโนมัติได้ถ้าเปิดโหมดนั้น') + '</div></div>';
  }
  function tempStatus() { return Core.statusOf(S.reading.temp, S.targets.tMin, S.targets.tMax, S.thresholds.tLo, S.thresholds.tHi); }
  function humidStatus() { return Core.statusOf(S.reading.humid, S.targets.hMin, S.targets.hMax, S.thresholds.hLo, S.thresholds.hHi); }
  var STATUS_TH = { good: 'อยู่ในช่วงเป้าหมาย', warning: 'นอกช่วงเป้าหมาย', critical: 'เกินเกณฑ์วิกฤต' };
  var PILL = { good: 'good', warning: 'warn', critical: 'crit' };

  function banners() {
    var out = '';
    if (S.safeState.active) {
      out += '<div class="card wide"><div class="banner crit">' + ico('warn') +
        '<div><b>ระบบอยู่ในสถานะปลอดภัย (Safe-State)</b>' + esc(S.safeState.reason) +
        ' — พัดลมและเครื่องเพิ่มความชื้นถูกปิด ระบบระบายอากาศถูกเปิดไว้ ระบบจะไม่กลับไปทำงานอัตโนมัติจนผู้ดูแลกดรับทราบ' +
        '<div><button class="btn sm primary" data-act="ackSafe">รับทราบและกลับสู่อัตโนมัติ</button></div></div></div></div>';
    }
    if (!S.ai.online) {
      out += '<div class="card wide"><div class="banner warn">' + ico('shield') +
        '<div><b>บริการ AI ไม่พร้อมใช้งาน</b>ระบบสลับไปใช้ตัวควบคุมตามกฎอัตโนมัติแล้ว การควบคุมอุณหภูมิและความชื้นยังทำงานปกติ (ไม่มีการพยากรณ์และคำแนะนำในช่วงนี้)</div></div></div>';
    }
    var conn = Core.connection(S);
    if (conn !== 'online' && !S.safeState.active) {
      out += '<div class="card wide"><div class="banner warn">' + ico('wifi') +
        '<div><b>ข้อมูลเซนเซอร์ค้าง</b>ไม่ได้รับค่าใหม่ ' + Math.round(S.clock - S.sensor.lastSeen) + ' วินาที — ระบบค้างคำสั่งล่าสุดไว้และหยุดออกคำสั่งใหม่</div></div></div>';
    }
    return out;
  }

  // ───────────────────────── หน้าตรวจวัด ─────────────────────────
  function viewMonitor() {
    var ts = tempStatus(), hs = humidStatus();
    var r = S.reading;
    var last24 = S.agg.filter(function (a) { return a.t > S.clock - 86400; });
    var tMinD = last24.length ? Math.min.apply(null, last24.map(function (a) { return a.tMin; })) : r.temp;
    var tMaxD = last24.length ? Math.max.apply(null, last24.map(function (a) { return a.tMax; })) : r.temp;
    var inRange = 0, tot = 0;
    S.raw.forEach(function (x) {
      tot++;
      if (x.temp >= S.targets.tMin && x.temp <= S.targets.tMax && x.humid >= S.targets.hMin && x.humid <= S.targets.hMax) inRange++;
    });
    var pct = tot ? Math.round((inRange / tot) * 100) : 0;
    var alerts24 = S.alerts.filter(function (a) { return a.t > S.clock - 86400; }).length;
    var conn = Core.connection(S);
    var connMap = { online: ['good', 'เชื่อมต่อปกติ'], stale: ['warn', 'ข้อมูลค้าง'], offline: ['crit', 'ขาดการเชื่อมต่อ'] };

    var html = banners();
    html += '<div class="card hero temp">' +
      '<div class="hero-top"><div style="flex:1"><div class="hero-label">อุณหภูมิในโรงเรือน</div>' +
      '<div class="readout"><span class="v">' + r.temp.toFixed(1) + '</span><span class="u">°C</span></div></div>' +
      statusPill(PILL[ts], STATUS_TH[ts]) + '</div>' +
      '<canvas class="spark" data-spark="temp"></canvas>' +
      '<div class="meta"><span>เป้าหมาย <b>' + S.targets.tMin + '–' + S.targets.tMax + ' °C</b></span>' +
      '<span>ต่ำ/สูงสุด 24 ชม. <b>' + tMinD.toFixed(1) + ' / ' + tMaxD.toFixed(1) + '</b></span>' +
      '<span>อัปเดต <b>' + Math.round(S.clock - r.at) + ' วิ.ที่แล้ว</b></span></div></div>';

    html += '<div class="card hero humid">' +
      '<div class="hero-top"><div style="flex:1"><div class="hero-label">ความชื้นสัมพัทธ์</div>' +
      '<div class="readout"><span class="v">' + r.humid.toFixed(0) + '</span><span class="u">%RH</span></div></div>' +
      statusPill(PILL[hs], STATUS_TH[hs]) + '</div>' +
      '<canvas class="spark" data-spark="humid"></canvas>' +
      '<div class="meta"><span>เป้าหมาย <b>' + S.targets.hMin + '–' + S.targets.hMax + ' %RH</b></span>' +
      '<span>เกณฑ์เตือน <b>&lt;' + S.thresholds.hLo + ' / &gt;' + S.thresholds.hHi + '</b></span></div></div>';

    html += '<div class="card wide"><div class="head">' + '<h2>สรุปการทำงาน</h2>' +
      statusPill(connMap[conn][0], connMap[conn][1], 'wifi') + '</div>' +
      '<div class="kpis">' +
      kpi('เวลาที่อยู่ในช่วงเป้าหมาย', pct + '%') +
      kpi('คำสั่งอุปกรณ์ทั้งหมด', S.stats.commands) +
      kpi('แจ้งเตือน 24 ชม.', alerts24) +
      kpi('แพ็กเก็ตที่ปฏิเสธ', S.sensor.rejected) +
      '</div>' +
      '<div class="chipline" style="margin-top:10px">' + Core.DEVICES.map(function (d) {
        var dv = S.devices[d.id];
        return '<span class="pill ' + (dv.on ? 'good' : 'quiet') + '">' + ico(d.icon) + esc(d.name) + ' · ' + (dv.on ? 'ทำงาน' : 'หยุด') + '</span>';
      }).join('') + '</div></div>';

    html += '<div class="card wide"><div class="head">' + '<h2>แจ้งเตือนล่าสุด</h2>' +
      '<span class="pill quiet">' + ico('bell') + 'รวบซ้ำทุก 15 นาที</span></div>' + alertList(4) + '</div>';
    return html;
  }
  function kpi(k, n) { return '<div class="kpi"><div class="k">' + esc(k) + '</div><div class="n">' + esc(String(n)) + '</div></div>'; }
  function alertList(n) {
    var a = S.alerts.slice(0, n);
    if (!a.length) return '<div class="empty">ยังไม่มีการแจ้งเตือน — ค่าทั้งหมดอยู่ในเกณฑ์</div>';
    return '<div class="list">' + a.map(function (x) {
      var k = x.level === 'critical' ? 'crit' : x.level === 'warning' ? 'warn' : 'good';
      return '<div class="item"><span class="when">' + hhmm(x.t) + '</span>' +
        '<span class="txt">' + statusPill(k, x.level === 'critical' ? 'วิกฤต' : x.level === 'warning' ? 'เตือน' : 'ปกติ') +
        ' ' + esc(x.message) + '</span></div>';
    }).join('') + '</div>';
  }

  // ───────────────────────── หน้าแนวโน้ม ─────────────────────────
  function fcPoints(kind) {
    var f = S.ai.forecast;
    if (!f || !S.ai.online) return [];
    if (kind === 'temp') return f.curve || [];
    return f.humidCurve || [];
  }

  function viewTrends() {
    var wins = [[1800, '30 นาที'], [10800, '3 ชม.'], [43200, '12 ชม.'], [172800, '48 ชม.']];
    var html = '<div class="card wide"><div class="head"><h2>แนวโน้มและการพยากรณ์</h2>' +
      '<button class="btn sm ghost" data-act="toggleTable">' + (showTable ? 'ดูกราฟ' : 'ดูเป็นตาราง') + '</button></div>' +
      '<div class="seg" style="width:max-content;margin-bottom:10px">' + wins.map(function (w) {
        return '<button data-act="win" data-v="' + w[0] + '" aria-pressed="' + (win === w[0]) + '">' + w[1] + '</button>';
      }).join('') + '</div>' +
      '<p class="sub">ช่วง ' + (win <= 10800 ? 'ใช้ข้อมูลดิบทุก 10 วินาที' : 'ใช้ค่าเฉลี่ยราย 5 นาที') +
      ' · เส้นประคือค่าพยากรณ์จากแบบจำลองสถิติ (Holt) พร้อมช่วงความเชื่อมั่น 95%</p></div>';

    if (showTable) {
      html += '<div class="card wide"><h2>ตารางข้อมูล (ค่าเฉลี่ยราย 5 นาที ล่าสุด)</h2>' +
        '<div class="tblbox"><table class="data"><thead><tr><th>เวลา</th><th>อุณหภูมิ (°C)</th><th>ต่ำ/สูง</th><th>ความชื้น (%RH)</th><th>ต่ำ/สูง</th></tr></thead><tbody>' +
        S.agg.slice(-60).reverse().map(function (a) {
          return '<tr><td>' + hhmm(a.t) + '</td><td>' + a.tAvg.toFixed(2) + '</td><td>' + a.tMin.toFixed(1) + ' / ' + a.tMax.toFixed(1) +
            '</td><td>' + a.hAvg.toFixed(1) + '</td><td>' + a.hMin.toFixed(0) + ' / ' + a.hMax.toFixed(0) + '</td></tr>';
        }).join('') + '</tbody></table></div></div>';
      return html;
    }
    html += '<div class="card wide"><h2 style="color:var(--temp)">อุณหภูมิ</h2>' +
      '<div class="chart-wrap"><canvas class="chart" data-chart="temp"></canvas><div class="tip" id="tip-temp"></div></div>' +
      '<div class="legend"><span><i style="background:var(--temp)"></i>ค่าที่วัดได้</span>' +
      '<span style="color:var(--temp)"><i class="dash"></i><span style="color:var(--ink-2)">พยากรณ์ 6 ชม. + ช่วงความเชื่อมั่น</span></span>' +
      '<span><i style="background:var(--band)"></i>ช่วงเป้าหมาย ' + S.targets.tMin + '–' + S.targets.tMax + ' °C</span></div></div>';
    html += '<div class="card wide"><h2 style="color:var(--humid)">ความชื้นสัมพัทธ์</h2>' +
      '<div class="chart-wrap"><canvas class="chart" data-chart="humid"></canvas><div class="tip" id="tip-humid"></div></div>' +
      '<div class="legend"><span><i style="background:var(--humid)"></i>ค่าที่วัดได้</span>' +
      '<span style="color:var(--humid)"><i class="dash"></i><span style="color:var(--ink-2)">พยากรณ์ 1 ชม.</span></span>' +
      '<span><i style="background:var(--band)"></i>ช่วงเป้าหมาย ' + S.targets.hMin + '–' + S.targets.hMax + ' %RH</span></div></div>';
    return html;
  }

  // ───────────────────────── หน้าควบคุม ─────────────────────────
  function viewControl() {
    var html = banners();
    html += '<div class="card wide"><div class="head"><h2>อุปกรณ์ในโรงเรือน</h2>' +
      '<span class="pill quiet">' + ico('clock') + '1 คำสั่ง/30 วินาที</span></div>';
    html += Core.DEVICES.map(function (d) {
      var dv = S.devices[d.id];
      var manualLeft = Math.max(0, Math.ceil(dv.manualUntil - S.clock));
      var gapLeft = Math.max(0, Math.ceil(Core.C.CMD_GAP - (S.clock - dv.lastCommandAt)));
      var note = dv.pending ? 'รอการตอบรับ… (ลองซ้ำ ' + dv.retries + '/3)' :
        dv.unresponsive ? 'ไม่ตอบสนอง — อยู่ในสถานะปลอดภัย' :
        manualLeft > 0 ? 'ควบคุมด้วยมือ · คืนสู่อัตโนมัติในอีก ' + fmtDur(manualLeft) :
        'ควบคุมอัตโนมัติ · ทำงานสะสม ' + (dv.runSeconds / 3600).toFixed(1) + ' ชม.';
      return '<div class="dev">' +
        '<div class="dev-top"><div class="dev-ico ' + (dv.on ? 'on' : '') + (d.id === 'fan' ? '' : ' nospin') + '">' + ico(d.icon) + '</div>' +
        '<div style="flex:1;min-width:0"><div class="dev-name">' + esc(d.name) + '</div><div class="dev-note">' + esc(note) + '</div></div>' +
        statusPill(dv.unresponsive ? 'crit' : dv.on ? 'good' : 'quiet', dv.on ? 'ทำงาน' : 'หยุด') + '</div>' +
        '<div class="row">' +
        '<button class="btn sm ' + (dv.on ? '' : 'primary') + '" data-act="cmd" data-dev="' + d.id + '" data-on="1"' + (dv.on || dv.unresponsive || S.role === 'viewer' ? ' disabled' : '') + '>เปิด</button>' +
        '<button class="btn sm ' + (dv.on ? 'primary' : '') + '" data-act="cmd" data-dev="' + d.id + '" data-on="0"' + (!dv.on || dv.unresponsive || S.role === 'viewer' ? ' disabled' : '') + '>ปิด</button>' +
        (manualLeft > 0 ? '<button class="btn sm ghost" data-act="release" data-dev="' + d.id + '">คืนสู่อัตโนมัติ</button>' : '') +
        (dv.ackRequired ? '<button class="btn sm primary" data-act="ackDev" data-dev="' + d.id + '">รับทราบความผิดพลาด</button>' : '') +
        (gapLeft > 0 && !dv.unresponsive ? '<span class="dev-note">รอ ' + gapLeft + ' วิ.</span>' : '') +
        '</div></div>';
    }).join('');
    html += '</div>';

    html += '<div class="card"><h2>ช่วงเป้าหมายต่อโซน</h2><p class="sub">โซน A — โรงเรือนหลัก (อุณหภูมิ 10–35 °C, ความชื้น 50–95 %RH)</p>' +
      '<div class="grid2">' +
      numField('tMin', 'อุณหภูมิต่ำสุด (°C)', S.targets.tMin, 10, 35, 0.5) +
      numField('tMax', 'อุณหภูมิสูงสุด (°C)', S.targets.tMax, 10, 35, 0.5) +
      numField('hMin', 'ความชื้นต่ำสุด (%RH)', S.targets.hMin, 50, 95, 1) +
      numField('hMax', 'ความชื้นสูงสุด (%RH)', S.targets.hMax, 50, 95, 1) +
      '</div>' + (formErr ? '<p class="err">' + esc(formErr) + '</p>' : '') +
      '<div class="row" style="margin-top:10px"><button class="btn primary" data-act="saveTargets"' + (S.role === 'viewer' ? ' disabled' : '') + '>บันทึกเป้าหมาย</button></div></div>';

    html += '<div class="card"><h2>การตัดสินคำสั่งขัดแย้ง</h2><p class="sub">ระบบระบายอากาศถูกใช้ร่วมกันระหว่างการคุมอุณหภูมิและความชื้น ฝ่ายที่เบี่ยงเบนจากเป้าหมายมากกว่าเป็นผู้ชนะ</p>' +
      (S.arbitration.length ? '<div class="list">' + S.arbitration.slice(0, 5).map(function (a) {
        return '<div class="item"><span class="when">' + hhmm(a.t) + '</span><span class="txt">' +
          '<b>' + (a.winner === 'temperature' ? 'อุณหภูมิ' : 'ความชื้น') + 'ชนะ</b> → ' + (a.result ? 'เปิด' : 'ปิด') + 'ระบบระบายอากาศ ' +
          '<span class="dev-note">(เบี่ยงเบน อุณหภูมิ ' + a.devT.toFixed(2) + ' · ความชื้น ' + a.devH.toFixed(2) + ')</span></span></div>';
      }).join('') + '</div>' : '<div class="empty">ยังไม่มีคำสั่งขัดแย้ง</div>') + '</div>';

    html += '<div class="card wide"><h2>ประวัติคำสั่ง</h2><div class="tblbox"><table class="data"><thead><tr><th>เวลา</th><th>อุปกรณ์</th><th>เหตุการณ์</th><th>สั่งโดย</th></tr></thead><tbody>' +
      S.commandLog.slice(0, 40).map(function (l) {
        var src = { manual: 'ผู้ดูแล', rule: 'ตัวควบคุมตามกฎ', 'ai-rule': 'ตัวควบคุมตามกฎ', ai: 'AI (อัตโนมัติ)', 'safe-state': 'สถานะปลอดภัย', operator: 'ผู้ดูแล' }[l.source] || l.source;
        var ev = { sent: 'ส่งคำสั่ง ' + (l.on ? 'เปิด' : 'ปิด'), ack: 'ตอบรับแล้ว (' + (l.on ? 'เปิด' : 'ปิด') + ')', unresponsive: 'ไม่ตอบสนอง → สถานะปลอดภัย', enter: 'เข้าสถานะปลอดภัย', resume: 'กลับสู่อัตโนมัติ', acknowledged: 'ผู้ดูแลรับทราบ' }[l.event] || l.event;
        return '<tr><td>' + hhmm(l.t) + '</td><td>' + esc(l.device === 'ทุกอุปกรณ์' ? l.device : Core.deviceName(l.device)) + '</td><td>' + esc(ev) + '</td><td>' + esc(src) + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
    return html;
  }
  function numField(k, label, v, mn, mx, st) {
    return '<div class="field"><label for="f-' + k + '">' + esc(label) + '</label>' +
      '<input id="f-' + k + '" type="number" data-target="' + k + '" value="' + v + '" min="' + mn + '" max="' + mx + '" step="' + st + '"></div>';
  }
  function fmtDur(sec) {
    var m = Math.floor(sec / 60), s = sec % 60;
    return m > 0 ? m + ' นาที ' + s + ' วิ.' : s + ' วินาที';
  }

  // ───────────────────────── หน้า AI ─────────────────────────
  function viewAI() {
    var html = banners();
    var f = S.ai.forecast, rec = S.ai.recommendation;
    html += '<div class="card"><div class="head"><h2>สถานะบริการ AI</h2>' +
      statusPill(S.ai.online ? 'good' : 'crit', S.ai.online ? 'ออนไลน์' : 'ไม่พร้อมใช้งาน', 'brain') + '</div>' +
      '<div class="switch"><div><div class="st">ให้ AI สั่งงานอัตโนมัติ</div>' +
      '<div class="sd">เมื่อปิด ระบบจะรอผู้ดูแลอนุมัติทุกคำแนะนำ (ค่าตั้งต้นตามสเปก)</div></div>' +
      '<button class="toggle" role="switch" aria-checked="' + (S.ai.autoApply ? 'true' : 'false') + '" data-act="autoApply" aria-label="ให้ AI สั่งงานอัตโนมัติ"></button></div>' +
      '<div class="switch"><div><div class="st">ความคลาดเคลื่อนพยากรณ์ที่วัดได้จริง</div>' +
      '<div class="sd">เทียบค่าที่พยากรณ์ล่วงหน้า 1 ชม. กับค่าที่วัดได้จริงเมื่อถึงเวลา (เกณฑ์ ≤ 1.5 °C)</div></div>' +
      '<span class="pill ' + (S.ai.accuracy.mae == null ? 'quiet' : S.ai.accuracy.mae <= 1.5 ? 'good' : 'warn') + '">MAE ' +
      (S.ai.accuracy.mae == null ? 'กำลังเก็บข้อมูล' : S.ai.accuracy.mae.toFixed(2) + ' °C (n=' + S.ai.accuracy.n + ')') + '</span></div></div>';

    if (f && S.ai.online) {
      html += '<div class="card"><h2>พยากรณ์อุณหภูมิ</h2>' +
        '<div class="kpis" style="grid-template-columns:1fr 1fr">' +
        kpi('อีก 1 ชั่วโมง', f.temp1h.value.toFixed(1) + ' °C') +
        kpi('อีก 6 ชั่วโมง', f.temp6h.value.toFixed(1) + ' °C') + '</div>' +
        '<div class="meta" style="margin-top:9px"><span>ช่วงความเชื่อมั่น 1 ชม. <b>' + f.temp1h.lo.toFixed(1) + '–' + f.temp1h.hi.toFixed(1) + ' °C</b></span>' +
        '<span>6 ชม. <b>' + f.temp6h.lo.toFixed(1) + '–' + f.temp6h.hi.toFixed(1) + ' °C</b></span>' +
        '<span>อัตราเปลี่ยนแปลง <b>' + (f.trendPerHour >= 0 ? '+' : '') + f.trendPerHour.toFixed(2) + ' °C/ชม.</b></span></div>' +
        '<p class="sub" style="margin-top:8px">คำนวณด้วยแบบจำลองสถิติ Holt แบบแนวโน้มหน่วง + ส่วนประกอบวัฏจักรรายวัน' +
        (f.diurnalReady ? ' (เรียนรู้จากประวัติแล้ว)' : ' (ยังเก็บประวัติไม่ถึง 6 ชม. จึงยังไม่ใช้ส่วนวัฏจักรรายวัน)') +
        ' — ไม่ได้ให้ภาษาโมเดลคำนวณตัวเลข</p></div>';
    }

    html += '<div class="card"><h2>รูปแบบที่ตรวจพบ</h2>' +
      (S.ai.pattern.length ? '<div class="list">' + S.ai.pattern.map(function (p) {
        return '<div class="item"><span class="txt"><b>' + esc(p.label) + '</b>' + confBar(p.confidence) + '</span></div>';
      }).join('') + '</div>' : '<div class="empty">' + (S.ai.online ? 'ยังไม่พบรูปแบบที่มีนัยสำคัญ' : 'บริการ AI ไม่พร้อมใช้งาน') + '</div>') + '</div>';

    html += '<div class="card wide"><div class="head"><h2>คำแนะนำการปรับสภาพแวดล้อม</h2>' +
      (rec && rec.device ? statusPill(rec.applied ? 'good' : 'warn', rec.applied ? 'ดำเนินการแล้ว' : 'รออนุมัติ') : '') + '</div>';
    if (!rec) html += '<div class="empty">' + (S.ai.online ? 'กำลังประมวลผล…' : 'บริการ AI ไม่พร้อมใช้งาน — ตัวควบคุมตามกฎกำลังทำงานแทน') + '</div>';
    else {
      html += '<div style="font-family:var(--font-display);font-weight:600;font-size:16px;margin-bottom:4px">' +
        esc(rec.device ? rec.action : 'ไม่ต้องปรับ — คงสถานะปัจจุบัน') + '</div>' +
        '<p style="margin:0 0 10px;font-size:13px;line-height:1.5">' + esc(rec.reason) + '</p>' + confBar(rec.confidence);
      if (rec.device && !rec.applied) {
        html += '<div class="row" style="margin-top:10px">' +
          '<button class="btn primary" data-act="approve"' + (S.role === 'viewer' ? ' disabled' : '') + '>อนุมัติและสั่งงาน</button>' +
          '<button class="btn ghost" data-act="dismiss">ไม่ดำเนินการ</button></div>';
      }
      html += '<p class="sub" style="margin-top:10px">ข้อความอธิบายเขียนเป็นภาษาคนได้ แต่ค่าตัวเลขของคำสั่งมาจากชั้นกฎและแบบจำลองเท่านั้น (ตาม AIAN-04)</p>';
    }
    html += '</div>';
    return html;
  }

  // ───────────────────────── หน้าเห็ด ─────────────────────────
  function viewCV() {
    var m = S.cv.metrics, q = S.cv.quality;
    var html = '<div class="card wide"><div class="head"><h2>วิเคราะห์การเจริญเติบโตจากภาพ</h2>' +
      statusPill(q ? (q.ok ? 'good' : 'crit') : 'quiet', q ? (q.ok ? 'ภาพผ่านเกณฑ์' : 'ภาพไม่ผ่านเกณฑ์') : 'ยังไม่มีภาพ', 'camera') + '</div>' +
      '<div class="viewer"><canvas class="cvcanvas" data-cv="1"></canvas>' +
      '<span class="stamp">โซน A · ' + (S.cv.lastCapture != null ? 'วันที่ ' + Core.fmtClock(S.cv.lastCapture).day + ' ' + hhmm(S.cv.lastCapture) : '—') +
      ' · YOLOv8 (จำลอง)</span></div>' +
      '<p class="sub" style="margin-top:8px">ถ่ายภาพทุก 30 นาที · รอบถัดไปในอีก ' + fmtDur(Math.max(0, Math.ceil(S.cv.nextCapture - S.clock))) +
      ' · วิเคราะห์สำเร็จ ' + S.cv.cycles + ' รอบ' + (S.cv.skipped ? ' · ข้าม ' + S.cv.skipped + ' รอบ' : '') + '</p>';
    if (m) {
      html += '<div class="mgrid">' +
        mcell('จำนวนดอก', m.count + ' ดอก') +
        mcell('ขนาดเฉลี่ย', m.size.toFixed(1) + ' ซม.') +
        mcell('พื้นที่ปกคลุม', m.coverage.toFixed(0) + ' %') +
        mcell('ระยะการเจริญเติบโต', m.stageTh) +
        mcell('สีดอก', m.color) +
        mcell('รุ่นที่เพาะ', 'รุ่น ' + S.growth.flush) + '</div>';
      html += '<div class="row" style="margin-top:10px">' +
        statusPill(m.harvest ? 'good' : 'quiet', m.harvest ? 'พร้อมเก็บเกี่ยว' : 'ยังไม่ถึงเกณฑ์เก็บเกี่ยว', 'mush') +
        (m.harvest ? '<button class="btn sm primary" data-act="harvest"' + (S.role === 'viewer' ? ' disabled' : '') + '>บันทึกการเก็บเกี่ยว</button>' : '') + '</div>';
    }
    html += '</div>';

    if (m) {
      html += '<div class="card"><h2>ความผิดปกติที่ตรวจพบ</h2>' +
        (m.anomalies.length ? '<div class="list">' + m.anomalies.map(function (a) {
          return '<div class="item"><span class="txt"><b>' + esc(a.label) + '</b>' + confBar(a.p) + '</span></div>';
        }).join('') + '</div>' : '<div class="empty">ไม่พบความผิดปกติในรอบนี้</div>') +
        '<p class="sub" style="margin-top:8px">ระบบแจ้งเตือนผู้ดูแลเท่านั้น ไม่สั่งงานแก้ไขอัตโนมัติ</p></div>';
      html += '<div class="card"><h2>คุณภาพภาพที่รับเข้า</h2>' +
        '<div class="kpis" style="grid-template-columns:1fr 1fr">' +
        kpi('ความสว่างเฉลี่ย', q.brightness.toFixed(0)) + kpi('ค่าความเบลอ', q.blur.toFixed(2)) + '</div>' +
        '<p class="sub" style="margin-top:8px">' + esc(q.note) + '</p></div>';
    }
    if (S.cv.history.length > 2) {
      html += '<div class="card wide"><h2>จำนวนดอกที่นับได้</h2>' +
        '<div class="chart-wrap"><canvas class="chart" data-chart="cvcount" style="height:150px"></canvas><div class="tip" id="tip-cvcount"></div></div></div>';
      html += '<div class="card wide"><h2>ขนาดเฉลี่ย (ซม.)</h2>' +
        '<div class="chart-wrap"><canvas class="chart" data-chart="cvsize" style="height:150px"></canvas><div class="tip" id="tip-cvsize"></div></div></div>';
    }
    return html;
  }
  function mcell(k, n) { return '<div><div class="k">' + esc(k) + '</div><div class="n">' + esc(String(n)) + '</div></div>'; }

  // ───────────────────────── แผ่นตั้งค่า ─────────────────────────
  function sheetHTML() {
    var sc = S.scenario;
    function sw(key, title, desc, on) {
      return '<div class="switch"><div><div class="st">' + esc(title) + '</div><div class="sd">' + esc(desc) + '</div></div>' +
        '<button class="toggle" role="switch" aria-checked="' + (on ? 'true' : 'false') + '" data-act="scen" data-k="' + key + '" aria-label="' + esc(title) + '"></button></div>';
    }
    var theme = document.documentElement.getAttribute('data-theme') || 'auto';
    return '<div class="grab"></div>' +
      '<div><h3>ตั้งค่าและสถานการณ์ทดสอบ</h3>' +
      '<p class="note">แอปนี้ใช้ข้อมูลจำลองจากแบบจำลองโรงเรือน (ยังไม่ต่อกับเซนเซอร์จริง) แต่ตรรกะการควบคุม ความปลอดภัย และ AI เป็นชุดเดียวกับที่จะใช้กับอุปกรณ์จริง</p></div>' +

      '<div><div class="sec-title">ผู้ใช้งานและมุมมอง</div>' +
      '<div class="grid2" style="margin-top:8px">' +
      '<div class="field"><label for="f-role">บทบาทผู้ใช้</label><select id="f-role" data-act="role">' +
      ['operator', 'admin', 'viewer'].map(function (r) {
        var th = { operator: 'ผู้ดูแลโรงเรือน', admin: 'ผู้จัดการฟาร์ม', viewer: 'ผู้ชม (ดูเท่านั้น)' }[r];
        return '<option value="' + r + '"' + (S.role === r ? ' selected' : '') + '>' + th + '</option>';
      }).join('') + '</select></div>' +
      '<div class="field"><label for="f-theme">ธีมสี</label><select id="f-theme" data-act="theme">' +
      [['auto', 'ตามระบบ'], ['light', 'สว่าง'], ['dark', 'มืด']].map(function (t) {
        return '<option value="' + t[0] + '"' + (theme === t[0] ? ' selected' : '') + '>' + t[1] + '</option>';
      }).join('') + '</select></div></div></div>' +

      '<div><div class="sec-title">เกณฑ์แจ้งเตือน</div><div class="grid2" style="margin-top:8px">' +
      numField2('tLo', 'อุณหภูมิต่ำกว่า (°C)', S.thresholds.tLo) +
      numField2('tHi', 'อุณหภูมิสูงกว่า (°C)', S.thresholds.tHi) +
      numField2('hLo', 'ความชื้นต่ำกว่า (%RH)', S.thresholds.hLo) +
      numField2('hHi', 'ความชื้นสูงกว่า (%RH)', S.thresholds.hHi) +
      '</div><div class="row" style="margin-top:9px"><button class="btn sm primary" data-act="saveTh">บันทึกเกณฑ์</button></div></div>' +

      '<div><div class="sec-title">สถานการณ์ทดสอบระบบความปลอดภัย</div>' +
      sw('heatwave', 'อากาศร้อนจัด', 'ดันอุณหภูมิภายนอกขึ้น 8 °C เพื่อดูการทำงานของการควบคุมและการแจ้งเตือน', sc.heatwave) +
      sw('doorOpen', 'ประตูโรงเรือนเปิดค้าง', 'ทำให้อุณหภูมิและความชื้นเปลี่ยนตามภายนอกอย่างรวดเร็ว', sc.doorOpen) +
      sw('sensorFail', 'เซนเซอร์ขาดการเชื่อมต่อ', 'หยุดส่งค่า → ค้างคำสั่ง 5 นาที แล้วเข้าสถานะปลอดภัย', sc.sensorFail) +
      sw('cameraFail', 'กล้องส่งภาพไม่ได้คุณภาพ', 'ข้ามการวิเคราะห์ภาพและแจ้งเตือน', sc.cameraFail) +
      sw('aiFail', 'บริการ AI ล่ม', 'ทดสอบการสลับไปตัวควบคุมตามกฎโดยไม่มีช่องว่างด้านความปลอดภัย', sc.aiFail) +
      '<div class="field" style="margin-top:8px"><label for="f-af">อุปกรณ์ที่ไม่ตอบรับคำสั่ง</label>' +
      '<select id="f-af" data-act="afail"><option value="">— ไม่มี —</option>' +
      Core.DEVICES.map(function (d) { return '<option value="' + d.id + '"' + (sc.actuatorFail === d.id ? ' selected' : '') + '>' + d.name + '</option>'; }).join('') +
      '</select></div></div>' +

      '<div><div class="sec-title">ข้อมูล</div>' +
      '<div class="row" style="margin-top:8px"><button class="btn sm" data-act="export">' + (exportOpen ? 'ซ่อนข้อมูล JSON' : 'ดูข้อมูล JSON') + '</button>' +
      '<button class="btn sm ghost" data-act="reset">เริ่มการจำลองใหม่</button></div>' +
      (exportOpen ? '<textarea id="jsonbox" readonly style="width:100%;height:132px;margin-top:9px;font-family:var(--font-mono);font-size:10.5px;border:1px solid var(--line);border-radius:9px;background:var(--surface-2);color:var(--ink);padding:8px">' +
        esc(JSON.stringify({ simClock: S.clock, targets: S.targets, thresholds: S.thresholds, forecastMAE: S.ai.accuracy, stats: S.stats, cvHistory: S.cv.history.slice(-20), agg: S.agg.slice(-40), alerts: S.alerts.slice(0, 20) }, null, 1)) +
        '</textarea><div class="row" style="margin-top:7px"><button class="btn sm primary" data-act="copyJson">คัดลอกทั้งหมด</button></div>' : '') +
      '<p class="note" style="margin-top:8px">เก็บข้อมูลดิบย้อนหลัง ' + S.raw.length + ' รายการ และค่าเฉลี่ยราย 5 นาที ' + S.agg.length + ' รายการ ในเครื่องของคุณเท่านั้น</p></div>' +
      '<div class="row"><button class="btn primary" data-act="closeSheet" style="width:100%">ปิด</button></div>';
  }
  function numField2(k, label, v) {
    return '<div class="field"><label for="th-' + k + '">' + esc(label) + '</label>' +
      '<input id="th-' + k + '" type="number" data-th="' + k + '" value="' + v + '" step="1"></div>';
  }

  // ───────────────────────── การประกอบหน้า ─────────────────────────
  var TABS = [
    ['monitor', 'ตรวจวัด', 'thermo'],
    ['trends', 'แนวโน้ม', 'chart'],
    ['control', 'ควบคุม', 'sliders'],
    ['ai', 'AI', 'brain'],
    ['cv', 'เห็ด', 'mush']
  ];

  var pointerDown = false;
  function render() {
    var ae = document.activeElement;
    var typing = pointerDown || (ae && (ae.tagName === 'INPUT' || ae.tagName === 'SELECT'));

    var f = Core.fmtClock(S.clock);
    var conn = Core.connection(S);
    var connMap = { online: ['good', 'ออนไลน์'], stale: ['warn', 'ข้อมูลค้าง'], offline: ['crit', 'ออฟไลน์'] };
    var top = document.getElementById('top');
    top.innerHTML =
      '<div class="top-row"><div class="brand"><b>Smart Mushroom Farm</b><span>ทีม โจรสลัดพิกเซล</span></div>' +
      '<span class="spacer"></span>' +
      '<span class="pill ' + connMap[conn][0] + '"><i class="dot ' + (conn === 'online' ? 'live' : '') + '"></i>' + connMap[conn][1] + '</span>' +
      '<button class="iconbtn" data-act="openSheet" aria-label="ตั้งค่า">' + ico('gear') + '</button></div>' +
      '<div class="top-row"><span class="clock">' + ico('clock') + 'วันที่ ' + f.day + ' · ' + f.hhmm + ' (เวลาจำลอง)</span>' +
      '<span class="spacer"></span>' +
      '<button class="iconbtn" data-act="run" aria-pressed="' + (S.running ? 'false' : 'true') + '" aria-label="' + (S.running ? 'หยุดชั่วคราว' : 'เดินระบบต่อ') + '">' + ico(S.running ? 'pause' : 'play') + '</button>' +
      '<div class="seg" role="group" aria-label="ความเร็วการจำลอง">' +
      [[1, '×1'], [6, '×6'], [60, '×60']].map(function (s) {
        return '<button data-act="speed" data-v="' + s[0] + '" aria-pressed="' + (S.speed === s[0]) + '">' + s[1] + '</button>';
      }).join('') + '</div></div>';

    if (!typing) {
      var main = document.getElementById('main');
      main.innerHTML =
        (view === 'monitor' ? viewMonitor() :
         view === 'trends' ? viewTrends() :
         view === 'control' ? viewControl() :
         view === 'ai' ? viewAI() : viewCV()) +
        '<p class="footer-note">ข้อมูลในแอปนี้มาจากแบบจำลองโรงเรือนเพาะเห็ด เพื่อสาธิตตรรกะควบคุมและ AI ก่อนติดตั้งเซนเซอร์จริง<br>' +
        'AI Smart Mushroom Farm · ทีม โจรสลัดพิกเซล · UP AI Hackathon 2026</p>';
      wireCanvases();
    }

    var unread = S.alerts.filter(function (a) { return a.t > lastSeenAlerts; }).length;
    document.getElementById('tabs').innerHTML = TABS.map(function (t) {
      var badge = (t[0] === 'monitor' && unread && view !== 'monitor') ? '<span class="badge">' + Math.min(9, unread) + '</span>' : '';
      return '<button data-act="tab" data-v="' + t[0] + '"' + (view === t[0] ? ' aria-current="page"' : '') + '>' + ico(t[2]) + badge + '<span>' + t[1] + '</span></button>';
    }).join('');

    var sh = document.getElementById('sheet');
    if (sheetOpen && !typing) sh.innerHTML = sheetHTML();
    sh.className = 'sheet' + (sheetOpen ? ' on' : '');
    document.getElementById('sheetbg').className = 'sheet-bg' + (sheetOpen ? ' on' : '');

    var tEl = document.getElementById('toast');
    if (toast && performance.now() - toastAt < 3400) {
      tEl.textContent = toast.msg;
      tEl.style.opacity = '1';
      tEl.style.borderColor = toast.kind === 'err' ? 'var(--crit)' : 'var(--good)';
    } else { tEl.style.opacity = '0'; toast = null; }
  }

  function wireCanvases() {
    document.querySelectorAll('canvas[data-spark]').forEach(function (cv) {
      drawSpark(cv, cv.getAttribute('data-spark'), cv.getAttribute('data-spark') === 'temp' ? css('--temp') : css('--humid'));
    });
    document.querySelectorAll('canvas[data-chart]').forEach(function (cv) {
      var kind = cv.getAttribute('data-chart');
      if (kind === 'temp') drawChart(cv, { id: 'temp', points: pickSeries('temp'), forecast: fcPoints('temp'), band: { lo: S.targets.tMin, hi: S.targets.tMax }, color: css('--temp'), fill: css('--temp-fill'), unit: '°C', label: 'อุณหภูมิ', dec: 1, minSpan: 2 });
      if (kind === 'humid') drawChart(cv, { id: 'humid', points: pickSeries('humid'), forecast: fcPoints('humid'), band: { lo: S.targets.hMin, hi: S.targets.hMax }, color: css('--humid'), fill: css('--humid-fill'), unit: '%RH', label: 'ความชื้น', dec: 0, minSpan: 6, clamp: [0, 100] });
      if (kind === 'cvcount') drawChart(cv, { id: 'cvcount', points: S.cv.history.map(function (h) { return { t: h.t, v: h.count }; }), color: css('--accent'), fill: 'rgba(0,0,0,0.06)', unit: 'ดอก', label: 'จำนวนดอก', dec: 0, minSpan: 3 });
      if (kind === 'cvsize') drawChart(cv, { id: 'cvsize', points: S.cv.history.map(function (h) { return { t: h.t, v: h.size }; }), color: css('--temp'), fill: css('--temp-fill'), unit: 'ซม.', label: 'ขนาดเฉลี่ย', dec: 1, minSpan: 1 });
      if (!cv._wired) {
        cv._wired = true;
        var move = function (e) {
          var rect = cv.getBoundingClientRect();
          var cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
          hover[kind] = cx; render();
        };
        cv.addEventListener('pointermove', move);
        cv.addEventListener('touchmove', move, { passive: true });
        cv.addEventListener('pointerleave', function () { hover[kind] = null; render(); });
        cv.addEventListener('touchend', function () { hover[kind] = null; render(); });
      }
    });
    var cvv = document.querySelector('canvas[data-cv]');
    if (cvv) drawCV(cvv);
  }

  // ───────────────────────── เหตุการณ์ ─────────────────────────
  function onClick(e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var act = el.getAttribute('data-act');
    if (act === 'tab') { view = el.getAttribute('data-v'); if (view === 'monitor') lastSeenAlerts = S.clock; hover = {}; render(); return; }
    if (act === 'speed') { S.speed = +el.getAttribute('data-v'); render(); return; }
    if (act === 'run') { S.running = !S.running; render(); return; }
    if (act === 'win') { win = +el.getAttribute('data-v'); render(); return; }
    if (act === 'toggleTable') { showTable = !showTable; render(); return; }
    if (act === 'openSheet') { sheetOpen = true; render(); return; }
    if (act === 'closeSheet') { sheetOpen = false; render(); return; }
    if (act === 'cmd') {
      var r = Core.sendCommand(S, el.getAttribute('data-dev'), el.getAttribute('data-on') === '1', 'manual');
      say(r.ok ? 'ส่งคำสั่งแล้ว — รอการตอบรับภายใน 5 วินาที' : r.reason, r.ok ? 'ok' : 'err');
      return;
    }
    if (act === 'release') { Core.releaseManual(S, el.getAttribute('data-dev')); say('คืนอุปกรณ์สู่การควบคุมอัตโนมัติแล้ว', 'ok'); return; }
    if (act === 'ackDev') { Core.acknowledgeDevice(S, el.getAttribute('data-dev')); say('รับทราบความผิดพลาดของอุปกรณ์แล้ว', 'ok'); return; }
    if (act === 'ackSafe') {
      var res = Core.acknowledgeSafeState(S);
      say(res.ok ? 'กลับสู่การควบคุมอัตโนมัติแล้ว' : res.reason, res.ok ? 'ok' : 'err');
      return;
    }
    if (act === 'autoApply') {
      S.ai.autoApply = !S.ai.autoApply;
      say(S.ai.autoApply ? 'เปิดโหมดให้ AI สั่งงานอัตโนมัติ (เฉพาะคำแนะนำที่ความเชื่อมั่น ≥ 60%)' : 'ปิดโหมดอัตโนมัติ — ทุกคำแนะนำต้องอนุมัติเอง', 'ok');
      return;
    }
    if (act === 'approve') {
      var ar = Core.approveRecommendation(S);
      say(ar.ok ? 'อนุมัติและส่งคำสั่งแล้ว' : ar.reason, ar.ok ? 'ok' : 'err');
      return;
    }
    if (act === 'dismiss') { if (S.ai.recommendation) S.ai.recommendation.applied = true; say('บันทึกว่าไม่ดำเนินการแล้ว', 'ok'); return; }
    if (act === 'harvest') { var hr = Core.harvestNow(S); say(hr.ok ? 'บันทึกการเก็บเกี่ยวแล้ว — เริ่มรอบเพาะใหม่' : hr.reason, hr.ok ? 'ok' : 'err'); return; }
    if (act === 'scen') {
      var k = el.getAttribute('data-k');
      Core.setScenario(S, k, !S.scenario[k]);
      say('ปรับสถานการณ์ทดสอบแล้ว', 'ok');
      return;
    }
    if (act === 'saveTargets') {
      var patch = {};
      ['tMin', 'tMax', 'hMin', 'hMax'].forEach(function (kk) {
        var inp = document.querySelector('[data-target="' + kk + '"]');
        if (inp) patch[kk] = parseFloat(inp.value);
      });
      var out = Core.setTargets(S, patch);
      formErr = out.ok ? '' : out.errors.join(' · ');
      say(out.ok ? 'บันทึกช่วงเป้าหมายแล้ว' : formErr, out.ok ? 'ok' : 'err');
      return;
    }
    if (act === 'saveTh') {
      ['tLo', 'tHi', 'hLo', 'hHi'].forEach(function (kk) {
        var inp = document.querySelector('[data-th="' + kk + '"]');
        if (inp && inp.value !== '') S.thresholds[kk] = parseFloat(inp.value);
      });
      say('บันทึกเกณฑ์แจ้งเตือนแล้ว', 'ok');
      return;
    }
    if (act === 'export') { exportOpen = !exportOpen; render(); return; }
    if (act === 'copyJson') {
      var ta = document.getElementById('jsonbox');
      if (!ta) return;
      ta.select();
      var done = false;
      try { done = document.execCommand('copy'); } catch (e2) {}
      if (navigator.clipboard && !done) {
        navigator.clipboard.writeText(ta.value).then(function () { say('คัดลอกข้อมูล JSON แล้ว', 'ok'); },
          function () { say('คัดลอกอัตโนมัติไม่ได้ — กดค้างในกล่องข้อความเพื่อคัดลอกเอง', 'err'); });
      } else say(done ? 'คัดลอกข้อมูล JSON แล้ว' : 'กดค้างในกล่องข้อความเพื่อคัดลอกเอง', done ? 'ok' : 'err');
      return;
    }
    if (act === 'reset') {
      S = Core.createState({ seed: (Date.now() % 100000) | 0 });
      try { localStorage.removeItem(KEY); } catch (err) {}
      sheetOpen = false; say('เริ่มการจำลองใหม่แล้ว', 'ok');
      return;
    }
  }

  function onChange(e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var act = el.getAttribute('data-act');
    if (act === 'role') { S.role = el.value; say('เปลี่ยนบทบาทเป็น ' + el.options[el.selectedIndex].text, 'ok'); }
    if (act === 'theme') {
      if (el.value === 'auto') document.documentElement.removeAttribute('data-theme');
      else document.documentElement.setAttribute('data-theme', el.value);
      try { localStorage.setItem('smartfarm.theme', el.value); } catch (err) {}
      render();
    }
    if (act === 'afail') { Core.setScenario(S, 'actuatorFail', el.value); say(el.value ? 'ตั้งให้อุปกรณ์ไม่ตอบรับคำสั่ง' : 'ยกเลิกการจำลองอุปกรณ์เสีย', 'ok'); }
  }

  // ───────────────────────── ลูปเวลา ─────────────────────────
  var lastFrame = 0, lastRender = 0, lastSave = 0;
  function frame(now) {
    if (!lastFrame) lastFrame = now;
    var dtReal = Math.min(0.5, (now - lastFrame) / 1000);
    lastFrame = now;
    if (S.running) Core.step(S, dtReal * 10 * S.speed);   // 1 วินาทีจริง = 10 วินาทีจำลอง ที่ ×1
    if (now - lastRender > 240) { lastRender = now; render(); }
    if (now - lastSave > 5000) { lastSave = now; save(); }
    requestAnimationFrame(frame);
  }

  function boot() {
    try {
      var th = localStorage.getItem('smartfarm.theme');
      if (th && th !== 'auto') document.documentElement.setAttribute('data-theme', th);
    } catch (e) {}
    S = load() || Core.createState({ seed: 20260827 });
    lastSeenAlerts = S.clock;
    document.addEventListener('pointerdown', function () { pointerDown = true; });
    document.addEventListener('pointerup', function () { pointerDown = false; });
    document.addEventListener('pointercancel', function () { pointerDown = false; });
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    document.getElementById('sheetbg').addEventListener('click', function () { sheetOpen = false; render(); });
    window.addEventListener('resize', function () { render(); });
    window.addEventListener('beforeunload', save);
    // เดินระบบล่วงหน้าเมื่อเปิดครั้งแรก
    if (S.raw.length < 60) Core.step(S, 26 * 3600);  // เดินล่วงหน้า 26 ชม.จำลอง ให้โมเดลเห็นวัฏจักรครบวันและมีกราฟให้ดูทันที
    render();
    requestAnimationFrame(frame);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
