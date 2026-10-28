import { newFatalIssues, validate } from '../../../src/core/validate'
import type { CampusRaw, EditableTable } from '../../../src/types'
import type { Env } from '../../env'
import { InputError, normalize } from '../../lib/normalize'
import {
  bumpVersionStatement,
  deleteStatement,
  logStatement,
  loadRaw,
  loadSurvey,
  TABLES,
  upsertStatement,
} from '../../lib/repo'
import type { AdminUser } from '../../lib/session'

// /api/admin/{buildings|nodes|edges|rooms|checkpoints|survey}
//   POST   … 追加（本文 { value }）
//   PUT    … 修正（本文 { value }。value.id で対象を決める）
//   DELETE … 削除（?id=対象のID）
// 保存の前に検査し、今回の変更で新しく「致命的な問題」が生まれるなら保存しない（設計書 5.5・5.6）

type Ctx = EventContext<Env, 'table', { user: AdminUser }>
type Action = 'insert' | 'update' | 'delete'

const CAMPUS_TABLES = ['buildings', 'nodes', 'edges', 'rooms', 'checkpoints'] as const
type CampusTable = (typeof CAMPUS_TABLES)[number]

export const onRequestPost = (ctx: Ctx) => handle(ctx, 'insert')
export const onRequestPut = (ctx: Ctx) => handle(ctx, 'update')
export const onRequestDelete = (ctx: Ctx) => handle(ctx, 'delete')

async function handle(ctx: Ctx, action: Action): Promise<Response> {
  const table = String(ctx.params.table) as EditableTable
  if (!(table in TABLES)) return json({ error: 'そのデータは編集できません' }, 404)
  const user = ctx.data.user.email

  try {
    // 削除は ?id=…、追加・修正は本文の value
    let value: { id?: string | number } | undefined
    let key: string | number
    if (action === 'delete') {
      const raw = new URL(ctx.request.url).searchParams.get('id')
      if (!raw) return json({ error: '削除するIDがありません' }, 400)
      key = table === 'edges' || table === 'survey' ? Number(raw) : raw
    } else {
      const body = (await ctx.request.json().catch(() => null)) as { value?: unknown } | null
      value = normalize(table, body?.value) as { id?: string | number }
      key = value.id ?? ''
    }

    if (table === 'survey') return await saveSurvey(ctx, action, key, value, user)
    return await saveCampus(ctx, table as CampusTable, action, key, value, user)
  } catch (e) {
    if (e instanceof InputError) return json({ error: e.message }, 400)
    // D1 の制約違反など
    const message = e instanceof Error ? e.message : String(e)
    return json({ error: `保存できませんでした（${message}）` }, 400)
  }
}

/** 棟・ノード・辺・部屋・チェックポイント：検査してから保存する */
async function saveCampus(
  ctx: Ctx,
  table: CampusTable,
  action: Action,
  key: string | number,
  value: { id?: string | number } | undefined,
  user: string,
): Promise<Response> {
  const db = ctx.env.DB
  const raw = await loadRaw(db)
  const list = raw[table] as { id?: string | number; from?: string; to?: string }[]
  const index = action === 'insert' ? -1 : list.findIndex((item) => item.id === key)
  if (action !== 'insert' && index < 0) return json({ error: '対象が見つかりません（ほかの人が消した可能性があります）' }, 404)
  if (action === 'insert' && table !== 'edges' && list.some((item) => item.id === key)) {
    return json({ error: `ID「${key}」はすでに使われています` }, 409)
  }
  const before = index >= 0 ? list[index] : undefined

  // 変更を当てはめたデータを作って検査する
  const nextList = [...list]
  if (action === 'insert') nextList.push(value!)
  else if (action === 'update') nextList[index] = value!
  else nextList.splice(index, 1)
  const next = { ...raw, [table]: nextList } as CampusRaw

  const issues = validate(next)
  const newFatal = newFatalIssues(validate(raw), issues)
  if (newFatal.length > 0) {
    return json({ error: '保存できません。次の問題を直してください', issues: newFatal }, 400)
  }

  const recordId =
    table === "edges" ? edgeLabel((value ?? before) as { from?: string; to?: string }) : String(key)
  await db.batch([
    action === 'delete' ? deleteStatement(db, table, key) : upsertStatement(db, table, value, user, action),
    logStatement(db, user, table, recordId, action, before, value),
    bumpVersionStatement(db),
  ])
  return json({ ok: true, issues })
}

/** 現地調査メモ：検査はせずに保存する（来校者の画面には出ない） */
async function saveSurvey(
  ctx: Ctx,
  action: Action,
  key: string | number,
  value: { id?: string | number } | undefined,
  user: string,
): Promise<Response> {
  const db = ctx.env.DB
  const before = action === 'insert' ? undefined : (await loadSurvey(db)).find((s) => s.id === key)
  if (action !== 'insert' && !before) return json({ error: 'メモが見つかりません' }, 404)
  const [result] = await db.batch([
    action === 'delete' ? deleteStatement(db, 'survey', key) : upsertStatement(db, 'survey', value, user, action),
    logStatement(db, user, 'survey', String(key || 'new'), action, before, value),
  ])
  return json({ ok: true, id: action === 'insert' ? result.meta.last_row_id : key })
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

function edgeLabel(e: { from?: string; to?: string }): string {
  return `${e.from}|${e.to}`
}
