import type { Env } from '../../../env'

// GET /api/admin/history — 変更履歴（新しい順に100件。?before=番号 でそれより前の100件）
export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const before = Number(new URL(request.url).searchParams.get('before') ?? 0)
  const stmt = before
    ? env.DB.prepare('SELECT * FROM change_log WHERE id < ? ORDER BY id DESC LIMIT 100').bind(before)
    : env.DB.prepare('SELECT * FROM change_log ORDER BY id DESC LIMIT 100')
  const { results } = await stmt.all<Record<string, unknown>>()
  const parse = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : null)
  return Response.json(
    results.map((r) => ({
      id: Number(r.id),
      at: String(r.at),
      user: String(r.user_email),
      table: String(r.table_name),
      recordId: String(r.record_id),
      action: String(r.action),
      before: parse(r.before),
      after: parse(r.after),
    })),
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
