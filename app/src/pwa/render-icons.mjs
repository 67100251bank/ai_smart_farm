import pw from '/home/claude/.npm-global/lib/node_modules/playwright/index.js';
import { readFileSync, writeFileSync } from 'node:fs';
const { chromium } = pw;
const b = await chromium.launch();
const jobs = [
  ['icon.svg', 192, 'icons/icon-192.png'],
  ['icon.svg', 512, 'icons/icon-512.png'],
  ['icon.svg', 180, 'icons/apple-touch-icon.png'],
  ['icon-maskable.svg', 512, 'icons/maskable-512.png'],
  ['icon.svg', 32,  'icons/favicon-32.png'],
];
for (const [svg, size, out] of jobs) {
  const p = await b.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  const data = readFileSync(new URL(svg, import.meta.url), 'utf8');
  await p.setContent(`<style>html,body{margin:0;padding:0}svg{display:block;width:${size}px;height:${size}px}</style>${data}`);
  await p.waitForTimeout(120);
  const buf = await p.screenshot({ omitBackground: false });
  writeFileSync(new URL(out, import.meta.url), buf);
  await p.close();
  console.log(out, size + 'px');
}
await b.close();
