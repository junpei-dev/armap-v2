import type { Env } from '../../env'
import { type AdminUser, getSessionUser } from '../../lib/session'

// /api/admin/ 以下のすべてのAPIの前に動く「門番」
// ログインしていなければ 401 を返し、中のAPIは動かさない。
// ログインしていれば、中のAPIから context.data.user で利用者を使えるようにする
export const onRequest: PagesFunction<Env, string, { user: AdminUser }> = async (context) => {
  const user = await getSessionUser(context.env, context.request)
  if (!user) return Response.json({ error: 'ログインしてください' }, { status: 401 })

  // 書き込み（POST など）は JSON だけを受け付ける。他のサイトのフォームから送らせないため
  const method = context.request.method
  if (method !== 'GET' && method !== 'HEAD') {
    const type = context.request.headers.get('Content-Type') ?? ''
    if (!type.startsWith('application/json')) {
      return Response.json({ error: 'Content-Type は application/json にしてください' }, { status: 415 })
    }
  }

  context.data.user = user
  return context.next()
}
