import type { EditableTable } from '../../../../../src/types'
import type { Env } from '../../../../env'
import { applyChange, type ChangeAction, inverseOf } from '../../../../lib/change'
import { loadRaw, loadSurvey } from '../../../../lib/repo'
import type { AdminUser } from '../../../../lib/session'

// POST /api/admin/history/{id}/undo — 変更履歴の1件を元に戻す（設計書 7.4）
// 打ち消す操作は通常の保存と同じ検査を通る。戻した操作も履歴に残る
export const onRequestPost: PagesFunction<Env, 'id', { user: AdminUser }> = async ({ env, params, data }) => {
  const row = await env.DB.prepare('SELECT * FROM change_log WHERE id = ?')
    .bind(Number(params.id))
    .first<Record<string, unknown>>()
  if (!row) return Response.json({ error: '履歴が見つかりません' }, { status: 404 })

  const table = String(row.table_name) as EditableTable
  const parse = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : null)
  const current =
    table === 'survey'
      ? await loadSurvey(env.DB)
      : ((await loadRaw(env.DB))[table as Exclude<EditableTable, 'survey'>] as { id?: string | number }[])

  const inverse = inverseOf(table, String(row.action) as ChangeAction, parse(row.before), parse(row.after), current)
  if ('error' in inverse) return Response.json({ error: `元に戻せません（${inverse.error}）` }, { status: 409 })

  try {
    const result = await applyChange(env.DB, data.user.email, table, inverse.action, inverse.key, inverse.value)
    return Response.json(result.body, { status: result.status })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return Response.json({ error: `元に戻せませんでした（${message}）` }, { status: 400 })
  }
}
