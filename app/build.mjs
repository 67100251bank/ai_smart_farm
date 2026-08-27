import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const r = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const css = r('./src/styles.css');
const core = r('./src/core.js');
const ui = r('./src/ui.js');
let body = r('./src/body.html')
  .replace('/*__CSS__*/', () => css)
  .replace('/*__CORE__*/', () => core)
  .replace('/*__UI__*/', () => ui);

mkdirSync(new URL('./dist/', import.meta.url), { recursive: true });
writeFileSync(new URL('./dist/artifact-body.html', import.meta.url), body);

const full = `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#005F6B">
<meta name="description" content="แอปควบคุมโรงเพาะเห็ดอัจฉริยะด้วย AI (โหมดจำลอง) — ทีม โจรสลัดพิกเซล UP AI Hackathon 2026">
${body.split('\n').filter(l => l.startsWith('<title') || l.startsWith('<link') || l.startsWith('<style')).join('\n')}
</head>
<body>
${body.split('\n').filter(l => !(l.startsWith('<title') || l.startsWith('<link') || l.startsWith('<style'))).join('\n')}
</body>
</html>
`;
writeFileSync(new URL('./dist/smart-farm-app.html', import.meta.url), full);
console.log('artifact-body.html', (body.length / 1024).toFixed(1) + ' KB');
console.log('smart-farm-app.html', (full.length / 1024).toFixed(1) + ' KB');
