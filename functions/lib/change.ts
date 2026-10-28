import { newFatalIssues, validate } from '../../src/core/validate'
import type { CampusRaw, EditableTable, Issue } from '../../src/types'
import {
  bumpVersionStatement,
  deleteStatement,
  logStatement,
  loadRaw,
  loadSurvey,
  upsertStatement,
} from './repo'

// データを1件、追加・修正・削除する共通の処理（設計書 5.6）
// 通常の保存（/api/admin/{table}）と「元に戻す」（/api/admin/history/{id}/undo）の両方で使う

export type ChangeAction = 'insert' | 'update' | 'delete'
export type ChangeResult = { status: number; body: { ok?: true; error?: string; issues?: Issue[]; id?: string | number } }

type Item = { id?: string | number; from?: string; to?: string }

const CAMPUS_TABLES = ['buildings', 'nodes', 'edges', 'rooms', 'checkpoints'] as const
type CampusTable = (typeof CAMPUS_TABLES)[number]

export async function applyChange(
  db: D1Database,
  user: string,
  table: EditableTable,
  action: ChangeAction,
  key: string | number,
  value: Item | undefined,
): Promise<ChangeResult> {
  if (table === 'survey') return saveSurvey(db, user, action, key, value)
  return saveCampus(db, user, table as CampusTable, action, key, value)
}

/** 棟・ノード・辺・部屋・チェックポイント：検査してから保存する */
async function saveCampus(
  db: D1Database,
  user: string,
  table: CampusTable,
  action: ChangeAction,
  key: string | number,
  value: Item | undefined,
): Promise<ChangeResult> {
  const raw = await loadRaw(db)
  const list = raw[table] as Item[]
  const index = action === 'insert' ? -1 : list.findIndex((item) => item.id === key)
  if (action !== 'insert' && index < 0) {
    return { status: 404, body: { error: '対象が見つかりません（ほかの人が消した可能性があります）' } }
  }
  if (action === 'insert' && key !== '' && key !== undefined && list.some((item) => item.id === key)) {
    return { status: 409, body: { error: `ID「${key}」はすでに使われています` } }
  }
  const before = index >= 0 ? list[index] : undefined

  // 変更を当てはめたデータを作って検査する。もともとあった問題では止めない
  const nextList = [...list]
  if (action === 'insert') nextList.push(value!)
  else if (action === 'update') nextList[index] = value!
  else nextList.splice(index, 1)
  const next = { ...raw, [table]: nextList } as CampusRaw

  const issues = validate(next)
  const newFatal = newFatalIssues(validate(raw), issues)
  if (newFatal.length > 0) {
    return { status: 400, body: { error: '保存できません。次の問題を直してください', issues: newFatal } }
  }

  const target = (value ?? before)!
  const recordId = table === 'edges' ? `${target.from}|${target.to}` : String(key)
  await db.batch([
    action === 'delete' ? deleteStatement(db, table, key) : upsertStatement(db, table, value, user, action),
    logStatement(db, user, table, recordId, action, before, value),
    bumpVersionStatement(db),
  ])
  return { status: 200, body: { ok: true, issues } }
}

/** 現地調査メモ：検査はせずに保存する（来校者の画面には出ない） */
async function saveSurvey(
  db: D1Database,
  user: string,
  action: ChangeAction,
  key: string | number,
  value: Item | undefined,
): Promise<ChangeResult> {
  const before = action === 'insert' ? undefined : (await loadSurvey(db)).find((s) => s.id === key)
  if (action !== 'insert' && !before) return { status: 404, body: { error: 'メモが見つかりません' } }

  if (action === 'insert') {
    // 新しい番号が決まってから履歴に書く（元に戻すときに、その番号で消せるように）
    const result = await upsertStatement(db, 'survey', value, user, 'insert').run()
    const id = value?.id ?? Number(result.meta.last_row_id)
    await logStatement(db, user, 'survey', String(id), 'insert', undefined, { ...value, id }).run()
    return { status: 200, body: { ok: true, id } }
  }
  await db.batch([
    action === 'delete' ? deleteStatement(db, 'survey', key) : upsertStatement(db, 'survey', value, user, action),
    logStatement(db, user, 'survey', String(key), action, before, value),
  ])
  return { status: 200, body: { ok: true, id: key } }
}

/**
 * 変更履歴の1件を打ち消す操作を求める（設計書 7.4「元に戻す」）
 *   追加 → 削除 ／ 修正 → 修正前の値に修正 ／ 削除 → 削除前の値を追加
 * 打ち消す操作も通常の保存と同じように検査し、履歴に残る（さらに元に戻すこともできる）
 */
export function inverseOf(
  table: EditableTable,
  action: ChangeAction,
  before: Item | null,
  after: Item | null,
  current: Item[],
): { action: ChangeAction; key: string | number; value?: Item } | { error: string } {
  if (action === 'insert') {
    if (!after) return { error: '追加した内容が記録されていません' }
    // 辺の番号はデータベースが決めるので、つないだ2つのノードで探す
    const found =
      table === 'edges'
        ? current.find((e) => e.from === after.from && e.to === after.to)
        : current.find((e) => e.id === after.id)
    if (!found || found.id === undefined) return { error: 'すでに削除されています' }
    return { action: 'delete', key: found.id }
  }
  if (action === 'update') {
    if (!before || before.id === undefined) return { error: '修正前の内容が記録されていません' }
    return { action: 'update', key: before.id, value: before }
  }
  if (!before) return { error: '削除前の内容が記録されていません' }
  return { action: 'insert', key: before.id ?? '', value: before }
}
