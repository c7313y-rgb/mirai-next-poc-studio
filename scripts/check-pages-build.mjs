import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../client/dist-pages/', import.meta.url));
const files = fs.readdirSync(root, { recursive: true }).filter(file => fs.statSync(path.join(root, file)).isFile());
const allowed = new Set(['.html', '.js', '.css', '.svg', '.webp', '.png', '.jpg', '.ico', '.txt']);
let publicEntryFound = false;
for (const file of files) {
  if (!allowed.has(path.extname(file)) || /(^|[/\\])(server|data|backups|exports)([/\\]|$)/.test(file) || /(^|[/\\])\.env/.test(file)) throw new Error(`Unexpected public artifact: ${file}`);
  if (/\.(html|js|css)$/.test(file)) {
    const content = fs.readFileSync(path.join(root, file), 'utf8');
    if (content.includes('mirai-next-public-demo-v1')) publicEntryFound = true;
    if (/-----BEGIN [A-Z ]*PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|\/Users\//.test(content)) throw new Error(`Potential private data in ${file}`);
    if (/fetch\(\s*["'`]\/api|\/auth\/config|\/auth\/demo/.test(content)) throw new Error(`Public demo must not call local server APIs: ${file}`);
  }
}
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
if (!publicEntryFound) throw new Error('The isolated public demo entry is missing');
if (!html.includes('/mirai-next-poc-studio/assets/') || html.includes('/src/')) throw new Error('Pages base/entry is not built correctly');
for (const file of ['enterprise-v2.webp', 'fieldwork-v2.webp', 'reflection-v2.webp']) {
  if (!fs.existsSync(path.join(root, 'images', file))) throw new Error(`Missing public scene: ${file}`);
}
console.log(`Public artifact verified: ${files.length} static files; no server/data artifacts.`);
