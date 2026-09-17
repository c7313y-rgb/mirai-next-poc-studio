import QRCode from 'qrcode';
import { q, tx } from '../db.js';
import { config } from '../config.js';
import { hashPassword } from './password.js';
import { makePseudoId, randomToken, randomPassword, sha256 } from './pseudo.js';

const ROLES = ['student', 'teacher', 'company', 'admin'];

export async function qrSvg(token) {
  return QRCode.toString(`${config.publicBaseUrl}/#/qr/${token}`, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
}

/**
 * AD-01 利用者一括登録。全行を検証し、1行でもエラーがあれば何も書き込まない。
 * 列: role, login_id, password, school_code, school_name, grade, class, attendance_no, student_key,
 *     company_code, company_name, company_industry, display_name, teacher_classes（例: 1-A|1-B）
 */
export function importUsers(rows) {
  const errors = [];
  const seen = new Set();
  for (const r of rows) {
    const line = r.__line;
    const role = r.role;
    if (!ROLES.includes(role)) { errors.push({ line, error: `role は ${ROLES.join('/')} のいずれか` }); continue; }
    if (!r.login_id || !/^[A-Za-z0-9._-]{2,64}$/.test(r.login_id)) errors.push({ line, error: "login_id は半角英数字・._- の2〜64文字" });
    if (seen.has(r.login_id)) errors.push({ line, error: `login_id「${r.login_id}」がCSV内で重複` });
    seen.add(r.login_id);
    if (r.password && r.password.length < 8) errors.push({ line, error: 'password は8文字以上（空欄なら自動発行）' });
    if (role === 'student') {
      if (!r.school_code) errors.push({ line, error: '生徒は school_code が必須' });
      if (!/^\d+$/.test(r.grade || '') || !r.class) errors.push({ line, error: '生徒は grade（数字）と class が必須' });
      if (!/^\d+$/.test(r.attendance_no || '')) errors.push({ line, error: '生徒は attendance_no（数字）が必須' });
      if (r.display_name) errors.push({ line, error: '生徒の氏名は登録できません（display_name は空欄にしてください）' });
    }
    if (role === 'teacher' && !r.school_code) errors.push({ line, error: '教員は school_code が必須' });
    if (role === 'company' && !r.company_code) errors.push({ line, error: '企業は company_code が必須' });
    if (r.school_code && !q.one('SELECT 1 FROM schools WHERE code=?', r.school_code) && !r.school_name && !rows.some((x) => x.school_code === r.school_code && x.school_name)) {
      errors.push({ line, error: `未登録の学校コード「${r.school_code}」は school_name も必要` });
    }
    if (r.company_code && !q.one('SELECT 1 FROM companies WHERE code=?', r.company_code) && !rows.some((x) => x.company_code === r.company_code && x.company_name)) {
      errors.push({ line, error: `未登録の企業コード「${r.company_code}」は company_name も必要` });
    }
  }
  if (errors.length) return { errors, created: 0, updated: 0, credentials: [] };

  const credentials = [];
  let created = 0, updated = 0;
  tx(() => {
    const schoolId = (code, name) => {
      if (!code) return null;
      const s = q.one('SELECT id FROM schools WHERE code=?', code);
      if (s) { if (name) q.run('UPDATE schools SET name=? WHERE id=?', name, s.id); return s.id; }
      return Number(q.run('INSERT INTO schools(code, name) VALUES(?,?)', code, name).lastInsertRowid);
    };
    const classId = (sid, grade, name) => {
      const c = q.one('SELECT id FROM classes WHERE school_id=? AND grade=? AND name=?', sid, Number(grade), name);
      return c ? c.id : Number(q.run('INSERT INTO classes(school_id, grade, name) VALUES(?,?,?)', sid, Number(grade), name).lastInsertRowid);
    };
    const companyId = (code, name, industry) => {
      if (!code) return null;
      const c = q.one('SELECT id FROM companies WHERE code=?', code);
      if (c) { if (name) q.run('UPDATE companies SET name=?, industry=COALESCE(?, industry) WHERE id=?', name, industry || null, c.id); return c.id; }
      return Number(q.run('INSERT INTO companies(code, name, industry) VALUES(?,?,?)', code, name, industry || null).lastInsertRowid);
    };

    for (const r of rows) {
      const sid = schoolId(r.school_code, r.school_name);
      const cid = r.role === 'student' ? classId(sid, r.grade, r.class) : null;
      const coid = r.role === 'company' ? companyId(r.company_code, r.company_name, r.company_industry) : null;
      const school = sid ? q.one('SELECT code FROM schools WHERE id=?', sid) : null;
      const pseudo = r.role === 'student'
        ? makePseudoId({ schoolCode: school.code, grade: r.grade, className: r.class, attendanceNo: r.attendance_no, studentKey: r.student_key })
        : null;
      const existing = q.one('SELECT * FROM users WHERE login_id=?', r.login_id);
      let userId;
      let issued = null;
      if (existing) {
        q.run('UPDATE users SET role=?, school_id=?, class_id=?, attendance_no=?, student_key=?, company_id=?, display_name=?, pseudo_id=?, active=1 WHERE id=?',
          r.role, sid, cid, r.attendance_no ? Number(r.attendance_no) : null, r.student_key || null, coid, r.role === 'student' ? null : r.display_name || null, pseudo, existing.id);
        userId = existing.id;
        if (r.password) { q.run('UPDATE users SET password_hash=? WHERE id=?', hashPassword(r.password), userId); issued = { password: r.password }; }
        updated++;
      } else {
        const pw = r.password || randomPassword();
        const token = randomToken();
        userId = Number(q.run(`INSERT INTO users(login_id, password_hash, role, school_id, class_id, attendance_no, student_key, company_id, display_name, pseudo_id, qr_token_hash, must_change_password)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`, r.login_id, hashPassword(pw), r.role, sid, cid, r.attendance_no ? Number(r.attendance_no) : null,
          r.student_key || null, coid, r.role === 'student' ? null : r.display_name || null, pseudo,
          ['student', 'teacher'].includes(r.role) ? sha256(token) : null, r.role === 'student' ? 0 : 1).lastInsertRowid);
        issued = { password: pw, qrToken: ['student', 'teacher'].includes(r.role) ? token : null };
        created++;
      }
      if (r.role === 'teacher') {
        q.run('DELETE FROM teacher_classes WHERE teacher_id=?', userId);
        for (const gc of String(r.teacher_classes || '').split('|').filter(Boolean)) {
          const [g, c] = gc.split('-');
          if (g && c) q.run('INSERT OR IGNORE INTO teacher_classes(teacher_id, class_id) VALUES(?,?)', userId, classId(sid, g, c));
        }
      }
      if (issued) credentials.push({ userId, loginId: r.login_id, role: r.role, grade: r.grade || null, class: r.class || null, attendanceNo: r.attendance_no || null, displayName: r.display_name || null, ...issued });
    }
  });
  return { errors: [], created, updated, credentials };
}

export function reissueCredentials(userIds) {
  const out = [];
  tx(() => {
    for (const id of userIds) {
      const u = q.one('SELECT u.*, c.grade, c.name AS class_name FROM users u LEFT JOIN classes c ON c.id=u.class_id WHERE u.id=?', id);
      if (!u) continue;
      const pw = randomPassword();
      const token = ['student', 'teacher'].includes(u.role) ? randomToken() : null;
      q.run('UPDATE users SET password_hash=?, qr_token_hash=?, must_change_password=? WHERE id=?', hashPassword(pw), token ? sha256(token) : null, u.role === 'student' ? 0 : 1, id);
      q.run('DELETE FROM sessions WHERE user_id=?', id); // 旧QR・旧パスワードでのログインを無効化
      out.push({ userId: id, loginId: u.login_id, role: u.role, grade: u.grade, class: u.class_name, attendanceNo: u.attendance_no, displayName: u.display_name, password: pw, qrToken: token });
    }
  });
  return out;
}

export async function withQr(credentials) {
  return Promise.all(credentials.map(async (c) => ({ ...c, qrSvg: c.qrToken ? await qrSvg(c.qrToken) : null, qrToken: undefined })));
}
