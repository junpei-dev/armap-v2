import type { Env } from '../../env'
import { sha256 } from '../../lib/password'
import { readSessionToken, sessionCookie } from '../../lib/session'

// POST /api/auth/logout — ログアウトする（セッションを消し、クッキーも消す）
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const token = readSessionToken(request)
  if (token) {
    await env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').bind(await sha256(token)).run()
  }
  return new Response(null, { status: 204, headers: { 'Set-Cookie': sessionCookie('', 0) } })
}
