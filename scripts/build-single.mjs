// index.html と css/js を1つのHTMLファイルにまとめる: node scripts/build-single.mjs [出力先]
// 出力は <!doctype> などの外枠を持たない断片（Artifact として公開するため）。
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const html = read('index.html');

const body = html.slice(html.indexOf('<!-- APP:START -->'), html.indexOf('<!-- APP:END -->'));
const fonts = html.match(/<link rel="stylesheet" href="https:\/\/fonts[^>]+>/)[0];
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => read(m[1]));
const title = html.match(/<title>[^<]*<\/title>/)[0];

const out = [
  title,
  fonts,
  `<style>\n${read('css/style.css')}</style>`,
  body.trim(),
  ...scripts.map((s) => `<script>\n${s}</script>`),
].join('\n');

const dest = process.argv[2] || path.join(root, 'dist', 'holdem-dojo.html');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, out);
console.log(`wrote ${dest} (${(out.length / 1024).toFixed(1)} KB)`);
