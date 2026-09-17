import crypto from 'node:crypto';
import { config } from '../config.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function encode(buf, len) {
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[buf[i] % ALPHABET.length];
  return out;
}

/**
 * 仮名ID。要件定義書7.3では「学校・学年・組・出席番号から生成」とされるが、
 * 年度替わりで学年・組が変わるとIDが変わり副担任mirAI側で別人扱いになる。
 * そのため student_key（学籍番号等の学内固定キー）があればそれを優先する。
 */
export function makePseudoId({ schoolCode, grade, className, attendanceNo, studentKey }) {
  const basis = studentKey
    ? `${schoolCode}|key|${studentKey}`
    : `${schoolCode}|${grade}|${className}|${attendanceNo}`;
  const h = crypto.createHmac('sha256', config.pseudoSecret).update(basis).digest();
  return 'MN-' + encode(h, 10);
}

export function plainId({ schoolCode, grade, className, attendanceNo }) {
  return `${schoolCode}-${grade}-${className}-${String(attendanceNo).padStart(2, '0')}`;
}

export function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url');
}
export function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}
export function randomPassword() {
  // 教室で読み上げ・手入力しやすい文字だけ
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const b = crypto.randomBytes(8);
  return Array.from(b, (x) => chars[x % chars.length]).join('');
}
