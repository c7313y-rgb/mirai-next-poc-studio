import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS schools (
  id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  start_date TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY, school_id INTEGER NOT NULL REFERENCES schools(id),
  grade INTEGER NOT NULL, name TEXT NOT NULL,
  UNIQUE(school_id, grade, name)
);
CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, industry TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  login_id TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student','teacher','company','admin')),
  school_id INTEGER REFERENCES schools(id),
  class_id INTEGER REFERENCES classes(id),
  attendance_no INTEGER,
  student_key TEXT,
  company_id INTEGER REFERENCES companies(id),
  display_name TEXT,
  pseudo_id TEXT UNIQUE,
  qr_token_hash TEXT UNIQUE,
  active INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS teacher_classes (
  teacher_id INTEGER NOT NULL REFERENCES users(id), class_id INTEGER NOT NULL REFERENCES classes(id),
  PRIMARY KEY (teacher_id, class_id)
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS themes (
  id INTEGER PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies(id),
  title TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', questions TEXT NOT NULL DEFAULT '[]',
  worksheet TEXT NOT NULL DEFAULT '', materials TEXT NOT NULL DEFAULT '[]', field TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS distributions (
  id INTEGER PRIMARY KEY, theme_id INTEGER NOT NULL REFERENCES themes(id),
  class_id INTEGER NOT NULL REFERENCES classes(id), teacher_id INTEGER NOT NULL REFERENCES users(id),
  start_date TEXT NOT NULL, end_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS theme_views (
  theme_id INTEGER NOT NULL, user_id INTEGER NOT NULL, first_viewed_at TEXT NOT NULL,
  view_count INTEGER NOT NULL DEFAULT 1, PRIMARY KEY (theme_id, user_id)
);
CREATE TABLE IF NOT EXISTS theme_interests (
  theme_id INTEGER NOT NULL, user_id INTEGER NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY (theme_id, user_id)
);
CREATE TABLE IF NOT EXISTS records (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
  school_id INTEGER NOT NULL, class_id INTEGER NOT NULL,
  type TEXT CHECK (type IN ('reflection','theme','experience')),
  theme_id INTEGER REFERENCES themes(id), experience_date TEXT,
  ocr_status TEXT NOT NULL DEFAULT 'pending' CHECK (ocr_status IN ('none','pending','done','error')),
  ocr_text TEXT, final_text TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted')),
  ai_status TEXT NOT NULL DEFAULT 'none' CHECK (ai_status IN ('none','pending','done','error')),
  feedback TEXT, tags TEXT NOT NULL DEFAULT '[]', summary TEXT,
  concern_flag INTEGER NOT NULL DEFAULT 0, concern_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  submitted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_records_user ON records(user_id, submitted_at);
CREATE INDEX IF NOT EXISTS idx_records_class ON records(class_id, submitted_at);
CREATE INDEX IF NOT EXISTS idx_records_theme ON records(theme_id);
CREATE TABLE IF NOT EXISTS record_images (
  id INTEGER PRIMARY KEY, record_id INTEGER NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, encrypted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY, record_id INTEGER NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  teacher_id INTEGER NOT NULL REFERENCES users(id), body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY, school_id INTEGER NOT NULL, class_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL REFERENCES users(id), record_id INTEGER REFERENCES records(id),
  kind TEXT NOT NULL CHECK (kind IN ('concern','inactive')), reason TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','handled','auto_resolved')),
  handled_by INTEGER, handled_at TEXT, note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_alerts_class ON alerts(class_id, status);
CREATE TABLE IF NOT EXISTS surveys (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('student','lesson','continuation')),
  questions TEXT NOT NULL, open_from TEXT, open_to TEXT, active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS survey_responses (
  id INTEGER PRIMARY KEY, survey_id INTEGER NOT NULL REFERENCES surveys(id),
  user_id INTEGER NOT NULL REFERENCES users(id), distribution_id INTEGER NOT NULL DEFAULT 0,
  answers TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(survey_id, user_id, distribution_id)
);
CREATE TABLE IF NOT EXISTS material_submissions (
  id INTEGER PRIMARY KEY, company_id INTEGER NOT NULL, user_id INTEGER NOT NULL, theme_id INTEGER,
  title TEXT NOT NULL, url TEXT, note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS voice_summaries (
  theme_id INTEGER PRIMARY KEY, summary TEXT NOT NULL, source_count INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review','approved')),
  generated_at TEXT NOT NULL, approved_by INTEGER, approved_at TEXT
);
CREATE TABLE IF NOT EXISTS survey_analyses (
  survey_id INTEGER PRIMARY KEY, result TEXT NOT NULL, generated_at TEXT NOT NULL
);
-- Curriculum originals, teacher-owned copies, and immutable lesson snapshots.
CREATE TABLE IF NOT EXISTS curricula (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  source_id INTEGER REFERENCES curricula(id),
  theme_id INTEGER REFERENCES themes(id),
  teacher_id INTEGER REFERENCES users(id),
  school_id INTEGER REFERENCES schools(id),
  title TEXT NOT NULL, source_content TEXT NOT NULL,
  audience TEXT NOT NULL, subject TEXT NOT NULL, duration INTEGER NOT NULL CHECK(duration IN (50,100)),
  objectives TEXT NOT NULL, stages TEXT NOT NULL, assessment TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','approved')),
  generated_by TEXT NOT NULL DEFAULT 'template',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK ((source_id IS NULL AND teacher_id IS NULL AND school_id IS NULL AND status != 'approved')
    OR (source_id IS NOT NULL AND teacher_id IS NOT NULL AND school_id IS NOT NULL AND status != 'published'))
);
CREATE INDEX IF NOT EXISTS idx_curricula_company ON curricula(company_id, status);
CREATE INDEX IF NOT EXISTS idx_curricula_teacher ON curricula(teacher_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_curricula_copy ON curricula(source_id, teacher_id) WHERE source_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS lessons (
  id INTEGER PRIMARY KEY,
  curriculum_id INTEGER NOT NULL REFERENCES curricula(id),
  class_id INTEGER NOT NULL REFERENCES classes(id),
  teacher_id INTEGER NOT NULL REFERENCES users(id),
  snapshot TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','active','completed')),
  stage_index INTEGER NOT NULL DEFAULT 0,
  scheduled_at TEXT,
  started_at TEXT, completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_lessons_class ON lessons(class_id, status);
CREATE TABLE IF NOT EXISTS lesson_responses (
  id INTEGER PRIMARY KEY,
  lesson_id INTEGER NOT NULL REFERENCES lessons(id),
  record_id INTEGER REFERENCES records(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  before_score INTEGER NOT NULL CHECK(before_score BETWEEN 1 AND 5),
  after_score INTEGER NOT NULL CHECK(after_score BETWEEN 1 AND 5),
  learning TEXT NOT NULL, next_action TEXT NOT NULL,
  interests TEXT NOT NULL DEFAULT '[]',
  submitted_at TEXT NOT NULL,
  UNIQUE(lesson_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_lesson_responses_user ON lesson_responses(user_id);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY, user_id INTEGER, role TEXT, type TEXT NOT NULL,
  target_type TEXT, target_id INTEGER, meta TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type, created_at);
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY, user_id INTEGER, role TEXT, action TEXT NOT NULL, detail TEXT, ip TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY, type TEXT NOT NULL, payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed')),
  attempts INTEGER NOT NULL DEFAULT 0, run_after TEXT NOT NULL, last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status, run_after);
CREATE TABLE IF NOT EXISTS exports (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, format TEXT NOT NULL,
  period_from TEXT NOT NULL, period_to TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued', file_name TEXT, row_count INTEGER, error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
`;

let db;

export function openDb(file = path.join(config.dataDir, 'mirai-next.db')) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  return db;
}

export function getDb() {
  if (!db) openDb();
  return db;
}

export const q = {
  one: (sql, ...p) => getDb().prepare(sql).get(...p),
  all: (sql, ...p) => getDb().prepare(sql).all(...p),
  run: (sql, ...p) => getDb().prepare(sql).run(...p),
};

export function tx(fn) {
  const d = getDb();
  d.exec('BEGIN');
  try {
    const r = fn();
    d.exec('COMMIT');
    return r;
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
}

export const nowIso = () => new Date().toISOString();
export const parseJson = (s, fallback) => {
  try { return s ? JSON.parse(s) : fallback; } catch { return fallback; }
};
