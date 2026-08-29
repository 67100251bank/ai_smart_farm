import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
const r = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const css = r('./src/styles.css');
const core = r('./src/core.js');
const ui = r('./src/ui.js');

// แยกส่วน head / body จาก "เทมเพลต" ก่อนแทรกโค้ด — ห้ามแยกทีหลัง
// เพราะ CSS/JS ที่แทรกเข้าไปมีหลายบรรทัด จะทำให้การแยกด้วยบรรทัดพัง
const tpl = r('./src/body.html');
const cut = tpl.indexOf('</style>') + '</style>'.length;
if (cut < 10) throw new Error('ไม่พบ </style> ในเทมเพลต');
const headPart = tpl.slice(0, cut).replace('/*__CSS__*/', () => css);
const bodyPart = tpl.slice(cut).replace('/*__CORE__*/', () => core).replace('/*__UI__*/', () => ui);

mkdirSync(new URL('./dist/', import.meta.url), { recursive: true });

// 1) เนื้อหาสำหรับเผยแพร่เป็น Artifact (ไม่มีโครง html/head/body)
const artifact = headPart + bodyPart;
writeFileSync(new URL('./dist/artifact-body.html', import.meta.url), artifact);

const doc = (extraHead, extraBody) => `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="แอปควบคุมโรงเพาะเห็ดอัจฉริยะด้วย AI (โหมดจำลอง) — ทีม โจรสลัดพิกเซล UP AI Hackathon 2026">
${headPart}
${extraHead}
</head>
<body>
${bodyPart.trim()}
${extraBody}
</body>
</html>
`;

// 2) ไฟล์เดียวจบ สำหรับดับเบิลคลิก / ส่งเข้ามือถือ (ไม่ต้องมีเซิร์ฟเวอร์)
writeFileSync(new URL('./dist/smart-farm-app.html', import.meta.url),
  doc('<meta name="theme-color" content="#005F6B">', ''));

// 3) ชุด PWA สำหรับ GitHub Pages — ติดตั้งลงมือถือได้
const pwaDir = new URL('./dist/pwa/', import.meta.url);
mkdirSync(new URL('./icons/', pwaDir), { recursive: true });
writeFileSync(new URL('./index.html', pwaDir),
  doc(r('./src/pwa/head.html').trim(), '<script>' + r('./src/pwa/register.js') + '</script>'));
copyFileSync(new URL('./src/pwa/manifest.webmanifest', import.meta.url), new URL('./manifest.webmanifest', pwaDir));
copyFileSync(new URL('./src/pwa/sw.js', import.meta.url), new URL('./sw.js', pwaDir));
for (const f of readdirSync(new URL('./src/pwa/icons/', import.meta.url))) {
  if (f.endsWith('.png') && !f.startsWith('_')) {
    copyFileSync(new URL('./src/pwa/icons/' + f, import.meta.url), new URL('./icons/' + f, pwaDir));
  }
}

const kb = (s) => (s.length / 1024).toFixed(1) + ' KB';
console.log('dist/artifact-body.html   ', kb(artifact));
console.log('dist/smart-farm-app.html  ', kb(doc('', '')));
console.log('dist/pwa/index.html        + manifest + sw.js + icons 5 ไฟล์');
