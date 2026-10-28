import type { EditableTable } from '../../../src/types'
import type { Env } from '../../env'
import { applyChange, type ChangeAction } from '../../lib/change'
import { InputError, normalize } from '../../lib/normalize'
import { TABLES } from '../../lib/repo'
import type { AdminUser } from '../../lib/session'

// /api/admin/{buildings|nodes|edges|rooms|checkpoints|survey}
//   POST   … 追加（本文 { value }）
//   PUT    … 修正（本文 { value }。value.id で対象を決める）
//   DELETE … 削除（?id=対象のID）
// 保存の前に検査し、今回の変更で新しく「致命的な問題」が生まれるなら保存しない（設計書 5.5・5.6）

type Ctx = EventContext<Env, 'table', { user: AdminUser }>

export const onRequestPost = (ctx: Ctx) => handle(ctx, 'insert')
export const onRequestPut = (ctx: Ctx) => handle(ctx, 'update')
export const onRequestDelete = (ctx: Ctx) => handle(ctx, 'delete')

async function handle(ctx: Ctx, action: ChangeAction): Promise<Response> {
  const table = String(ctx.params.table) as EditableTable
  if (!(table in TABLES)) return Response.json({ error: 'そのデータは編集できません' }, { status: 404 })

  try {
    // 削除は ?id=…、追加・修正は本文の value
    let value: { id?: string | number } | undefined
    let key: string | number
    if (action === 'delete') {
      const raw = new URL(ctx.request.url).searchParams.get('id')
      if (!raw) return Response.json({ error: '削除するIDがありません' }, { status: 400 })
      key = table === 'edges' || table === 'survey' ? Number(raw) : raw
    } else {
      const body = (await ctx.request.json().catch(() => null)) as { value?: unknown } | null
      value = normalize(table, body?.value) as { id?: string | number }
      key = value.id ?? ''
    }
    const result = await applyChange(ctx.env.DB, ctx.data.user.email, table, action, key, value)
    return Response.json(result.body, { status: result.status })
  } catch (e) {
    if (e instanceof InputError) return Response.json({ error: e.message }, { status: 400 })
    // D1 の制約違反など
    const message = e instanceof Error ? e.message : String(e)
    return Response.json({ error: `保存できませんでした（${message}）` }, { status: 400 })
  }
}
