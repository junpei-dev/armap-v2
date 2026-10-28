import type { Env } from '../../env'
import type { AdminUser } from '../../lib/session'

// GET /api/admin/whoami — ログインしている人を返す
// ログインの確認は _middleware.ts が済ませているので、ここでは結果を返すだけ
export const onRequestGet: PagesFunction<Env, string, { user: AdminUser }> = async ({ data }) => {
  return Response.json(data.user)
}
