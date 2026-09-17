import readline from 'node:readline/promises';
import { openDb, q } from '../server/db.js';
import { hashPassword } from '../server/lib/password.js';

const loginId = process.argv[2];
if (!loginId) { console.error('使い方: npm run create-admin -- <login_id>'); process.exit(1); }
openDb();
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const pw = await rl.question('パスワード（12文字以上）: ');
rl.close();
if (pw.length < 12) { console.error('12文字以上にしてください'); process.exit(1); }
if (q.one('SELECT 1 FROM users WHERE login_id=?', loginId)) { console.error('このIDは使用済みです'); process.exit(1); }
q.run("INSERT INTO users(login_id, password_hash, role, display_name) VALUES(?,?,'admin','運営管理者')", loginId, hashPassword(pw));
console.log(`運営管理者 ${loginId} を作成しました`);
