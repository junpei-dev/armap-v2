import type { Env } from '../env'
import { sha256 } from './password'

// 管理コンソールのセッション（ログイン状態）の扱い

export const SESSION_COOKIE = 'armap_session'
export const SESSION_DAYS = 7

export type AdminUser = { email: string; role: 'teacher' | 'student' }

/** リクエストのクッキーからセッショントークンを取り出す */
export function readSessionToken(request: Request): string | null {
  const cookie = request.headers.get('Cookie') ?? ''
  for (const part of cookie.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === SESSION_COOKIE) return rest.join('=') || null
  }
  return null
}

/** セッションが有効なら、ログインしている利用者を返す */
export async function getSessionUser(env: Env, request: Request): Promise<AdminUser | null> {
  const token = readSessionToken(request)
  if (!token) return null
  const row = await env.DB.prepare(
    `SELECT u.email, u.role FROM admin_sessions s
       JOIN admin_users u ON u.email = s.email
      WHERE s.token_hash = ? AND s.expires_at > datetime('now') AND u.disabled = 0`,
  )
    .bind(await sha256(token))
    .first<AdminUser>()
  return row ?? null
}

/** セッションのクッキー。JavaScript から読めず（HttpOnly）、HTTPS のみ、他サイトからは送られない */
export function sessionCookie(token: string, maxAgeSeconds: number): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSeconds}`
}
