// 実証終了後のデータ削除（要件定義書7.2）。取り消し不可のため確認語の入力を求める。
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { config } from '../server/config.js';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
console.log(`削除対象: ${config.dataDir}（DB・手帳画像・出力ファイル）`);
const ans = await rl.question('削除する場合は「全データを削除」と入力: ');
rl.close();
if (ans !== '全データを削除') { console.log('中止しました'); process.exit(0); }
for (const name of ['mirai-next.db', 'mirai-next.db-wal', 'mirai-next.db-shm', 'uploads', 'exports']) {
  fs.rmSync(path.join(config.dataDir, name), { recursive: true, force: true });
}
console.log('削除しました。バックアップ（BACKUP_DIR）も契約に従い削除してください。削除証明の記録を残してください。');
