/**
 * 管理コンソールのパスコードを発行する（教師用PCで実行・手順書 2.5）
 *
 * 使い方:
 *   node tools/issue_passcodes.ts                    local/admin-users.txt の全員に発行する
 *   node tools/issue_passcodes.ts 6029_2024_304i@…   指定した人だけ発行し直す（忘れたとき）
 *
 * 出力（どちらも local/ = git に入らない）:
 *   local/passcodes.txt  配布用の一覧（メールアドレスとパスコード）。配ったら削除してよい
 *   local/passcodes.sql  D1 に登録する SQL（パスコードそのものは入っていない。ハッシュのみ）
 *
 * 発行した後、次のコマンドで本番の D1 に登録する:
 *   npx wrangler d1 execute armap-v2 --remote --file=local/passcodes.sql
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { generatePasscode, hashPasscode, newSalt } from '../functions/lib/password.ts'

const TEACHER_EMAIL = '201536_teacher@g.miyazaki-c.ed.jp'
const USERS_FILE = 'local/admin-users.txt'

const allEmails = readFileSync(USERS_FILE, 'utf8')
  .split(/\r?\n/)
  .map((line) => line.trim().toLowerCase())
  .filter((line) => line && !line.startsWith('#'))

const targets = process.argv.slice(2).map((e) => e.toLowerCase())
for (const t of targets) {
  if (!allEmails.includes(t)) {
    console.error(`${t} は ${USERS_FILE} にありません。先に追加してください`)
    process.exit(1)
  }
}
const emails = targets.length > 0 ? targets : allEmails

const q = (s: string) => `'${s.replace(/'/g, "''")}'`
const sql: string[] = ['-- tools/issue_passcodes.ts で生成（パスコードのハッシュのみ。パスコードそのものは含まない）']
const list: string[] = [`# 管理コンソールのパスコード（${new Date().toLocaleString('ja-JP')} 発行）`, '# 配布したらこのファイルは削除してよい', '']

for (const email of emails) {
  const passcode = generatePasscode()
  const salt = newSalt()
  const hash = await hashPasscode(passcode, salt)
  const role = email === TEACHER_EMAIL ? 'teacher' : 'student'
  // 既にいる人はパスコードだけ入れ替え、ロックを解除し、ログイン中のセッションを切る
  sql.push(
    `INSERT INTO admin_users (email, pass_hash, pass_salt, role) VALUES (${q(email)}, ${q(hash)}, ${q(salt)}, ${q(role)})` +
      ` ON CONFLICT(email) DO UPDATE SET pass_hash = excluded.pass_hash, pass_salt = excluded.pass_salt,` +
      ` failed_count = 0, locked_until = NULL;`,
    `DELETE FROM admin_sessions WHERE email = ${q(email)};`,
  )
  list.push(`${email}\t${passcode}`)
}

writeFileSync('local/passcodes.sql', sql.join('\n') + '\n')
writeFileSync('local/passcodes.txt', list.join('\n') + '\n')
console.log(`${emails.length}人分のパスコードを発行しました`)
console.log('  配布用: local/passcodes.txt')
console.log('  登録用: local/passcodes.sql')
console.log('次のコマンドで本番の D1 に登録してください:')
console.log('  npx wrangler d1 execute armap-v2 --remote --file=local/passcodes.sql')
