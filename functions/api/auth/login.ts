import type { Env } from '../../env'
import { newSessionToken, verifyPasscode } from '../../lib/password'
import { SESSION_DAYS, sessionCookie } from '../../lib/session'

// POST /api/auth/login — メールアドレスとパスコードでログインする
// 5回続けて間違えると15分間ログインできなくする（総当たり対策）

const MAX_FAILURES = 5
const LOCK_MINUTES = 15

type UserRow = {
  email: string
  pass_hash: string
  pass_salt: string
  disabled: number
  failed_count: number
  locked: number // 1 なら現在ロック中
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = (await request.json().catch(() => null)) as { email?: unknown; passcode?: unknown } | null
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const passcode = typeof body?.passcode === 'string' ? body.passcode : ''
  if (!email || !passcode) return error(400, 'メールアドレスとパスコードを入力してください')

  const user = await env.DB.prepare(
    `SELECT email, pass_hash, pass_salt, disabled, failed_count,
            (locked_until IS NOT NULL AND locked_until > datetime('now')) AS locked
       FROM admin_users WHERE email = ?`,
  )
    .bind(email)
    .first<UserRow>()

  // 登録されていない・使えない人には、どこが違うかを教えない
  if (!user || user.disabled) return error(401, 'メールアドレスかパスコードが違います')
  if (user.locked) return error(429, `続けて間違えたため、${LOCK_MINUTES}分間ログインできません`)

  if (!(await verifyPasscode(passcode, user.pass_salt, user.pass_hash))) {
    const failures = user.failed_count + 1
    await env.DB.prepare(
      `UPDATE admin_users SET failed_count = ?,
              locked_until = CASE WHEN ? >= ? THEN datetime('now', ?) ELSE locked_until END
        WHERE email = ?`,
    )
      .bind(failures >= MAX_FAILURES ? 0 : failures, failures, MAX_FAILURES, `+${LOCK_MINUTES} minutes`, email)
      .run()
    return error(401, 'メールアドレスかパスコードが違います')
  }

  const { token, tokenHash } = await newSessionToken()
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE admin_users SET failed_count = 0, locked_until = NULL, last_login_at = datetime('now') WHERE email = ?`,
    ).bind(email),
    env.DB.prepare(`DELETE FROM admin_sessions WHERE expires_at <= datetime('now')`),
    env.DB.prepare(
      `INSERT INTO admin_sessions (token_hash, email, expires_at) VALUES (?, ?, datetime('now', ?))`,
    ).bind(tokenHash, email, `+${SESSION_DAYS} days`),
  ])

  return new Response(JSON.stringify({ email }), {
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': sessionCookie(token, SESSION_DAYS * 24 * 60 * 60),
    },
  })
}

function error(status: number, message: string): Response {
  return Response.json({ error: message }, { status })
}
