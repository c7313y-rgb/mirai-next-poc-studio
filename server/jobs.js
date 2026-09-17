import fs from 'node:fs';
import path from 'node:path';
import { q, nowIso, parseJson } from './db.js';
import { config } from './config.js';
import { ai } from './ai/index.js';
import { readFile } from './lib/filestore.js';
import { buildExportDataset, renderExport } from './export.js';
import { createHash } from 'node:crypto';
import { keywordConcern } from './lib/safety.js';
import { normalizeTags } from './lib/taxonomy.js';

const MAX_ATTEMPTS = 3;
let running = 0;
let timer = null;

export function enqueue(type, payload, delayMs = 0) {
  q.run('INSERT INTO jobs(type, payload, run_after) VALUES(?,?,?)', type, JSON.stringify(payload), new Date(Date.now() + delayMs).toISOString());
  kick();
}

const textDigest = (text) => createHash('sha256').update(String(text || '')).digest('hex');

// Keep an open concern until a teacher handles it; a pupil's edit must not erase it.
function updateConcern(record, concern) {
  let open = q.one("SELECT id,reason FROM alerts WHERE record_id=? AND kind='concern' AND status='open' ORDER BY id DESC LIMIT 1", record.id);
  if (concern.flag) {
    const reason = concern.reason || '要確認の記述';
    if (open) q.run('UPDATE alerts SET reason=? WHERE id=?', reason, open.id);
    else q.run("INSERT INTO alerts(school_id,class_id,student_id,record_id,kind,reason) VALUES(?,?,?,?,'concern',?)", record.school_id, record.class_id, record.user_id, record.id, reason);
    open = { reason };
  }
  q.run('UPDATE records SET concern_flag=?,concern_reason=? WHERE id=?', open ? 1 : 0, open?.reason || null, record.id);
}

export function queueRecordAnalysis(recordId, { preserveTags = false } = {}) {
  const record = q.one("SELECT * FROM records WHERE id=? AND status='submitted'", recordId);
  if (!record) return;
  // The keyword fallback is synchronous, even while the AI provider is unavailable.
  updateConcern(record, keywordConcern(record.final_text));
  q.run("UPDATE records SET ai_status='pending',feedback=NULL WHERE id=?", recordId);
  q.run("UPDATE alerts SET status='auto_resolved',handled_at=? WHERE student_id=? AND kind='inactive' AND status='open'", nowIso(), record.user_id);
  enqueue('analyze', { recordId, textDigest: textDigest(record.final_text), preserveTags });
}

const handlers = {
  async ocr({ recordId }) {
    const imgs = q.all('SELECT * FROM record_images WHERE record_id=? ORDER BY id', recordId);
    const images = imgs.map((i) => ({ mime: i.mime, buffer: readFile(i.file_name, i.encrypted) }));
    const { text } = await ai().ocr(images);
    q.run("UPDATE records SET ocr_text=?, ocr_status='done' WHERE id=?", text, recordId);
  },
  async analyze({ recordId, textDigest: expectedDigest, preserveTags = false }) {
    const r = q.one('SELECT r.*, t.title AS theme_title FROM records r LEFT JOIN themes t ON t.id=r.theme_id WHERE r.id=?', recordId);
    if (!r || r.status !== 'submitted') return;
    if (expectedDigest && expectedDigest !== textDigest(r.final_text)) return;
    const out = await ai().analyze({ text: r.final_text || '', type: r.type, themeTitle: r.theme_title });
    const current = q.one('SELECT * FROM records WHERE id=?', recordId);
    // A response can be edited while a model request is in flight.
    if (!current || current.final_text !== r.final_text) return;
    const tags = preserveTags ? normalizeTags([...parseJson(current.tags, []), ...out.tags]) : out.tags;
    q.run("UPDATE records SET feedback=?, tags=?, summary=?, ai_status='done' WHERE id=?", out.feedback, JSON.stringify(tags), out.summary, recordId);
    const keyword = keywordConcern(current.final_text);
    updateConcern(current, out.concern.flag ? out.concern : keyword);
  },
  async export({ exportId }) {
    const ex = q.one('SELECT * FROM exports WHERE id=?', exportId);
    q.run("UPDATE exports SET status='running' WHERE id=?", exportId);
    const dataset = await buildExportDataset({ from: ex.period_from, to: ex.period_to, withAiSummary: true });
    const { content, ext } = renderExport(dataset, ex.format);
    const dir = path.join(config.dataDir, 'exports');
    fs.mkdirSync(dir, { recursive: true });
    const fileName = `mirai-link_${ex.period_from}_${ex.period_to}_${exportId}.${ext}`;
    fs.writeFileSync(path.join(dir, fileName), content, { mode: 0o600 });
    q.run("UPDATE exports SET status='done', file_name=?, row_count=? WHERE id=?", fileName, dataset.records.length, exportId);
  },
};

async function runOne(job) {
  running++;
  try {
    await handlers[job.type](parseJson(job.payload, {}));
    q.run("UPDATE jobs SET status='done', updated_at=? WHERE id=?", nowIso(), job.id);
  } catch (e) {
    const attempts = job.attempts + 1;
    const failed = attempts >= MAX_ATTEMPTS;
    console.error(`[job ${job.id} ${job.type}] ${e.message}`);
    q.run('UPDATE jobs SET status=?, attempts=?, last_error=?, run_after=?, updated_at=? WHERE id=?',
      failed ? 'failed' : 'queued', attempts, String(e.message).slice(0, 500),
      new Date(Date.now() + 5000 * attempts ** 2).toISOString(), nowIso(), job.id);
    if (failed) onFinalFailure(job);
  } finally {
    running--;
    kick();
  }
}

function onFinalFailure(job) {
  const p = parseJson(job.payload, {});
  if (job.type === 'ocr') q.run("UPDATE records SET ocr_status='error' WHERE id=?", p.recordId);
  if (job.type === 'analyze') {
    const r = q.one('SELECT * FROM records WHERE id=?', p.recordId);
    if (!r || (p.textDigest && p.textDigest !== textDigest(r.final_text))) return;
    q.run("UPDATE records SET ai_status='error' WHERE id=?", p.recordId);
    updateConcern(r, keywordConcern(r.final_text));
  }
  if (job.type === 'export') q.run("UPDATE exports SET status='failed', error=? WHERE id=?", 'AI要約または出力に失敗しました', p.exportId);
}

export function kick() {
  while (running < config.ai.concurrency) {
    const job = q.one("SELECT * FROM jobs WHERE status='queued' AND run_after <= ? ORDER BY CASE type WHEN 'ocr' THEN 0 WHEN 'analyze' THEN 1 ELSE 2 END, id LIMIT 1", nowIso());
    if (!job) break;
    const claimed = q.run("UPDATE jobs SET status='running', updated_at=? WHERE id=? AND status='queued'", nowIso(), job.id);
    if (claimed.changes) runOne(job);
  }
}

export function startWorker() {
  q.run("UPDATE jobs SET status='queued' WHERE status='running'"); // 再起動時の復旧
  timer = setInterval(kick, 2000);
  timer.unref?.();
  kick();
}

export function stopWorker() { if (timer) clearInterval(timer); }

export async function drainJobs(timeoutMs = 10000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    kick();
    const pending = q.one("SELECT COUNT(*) c FROM jobs WHERE status IN ('queued','running')").c;
    if (!pending && running === 0) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('jobs did not drain');
}
