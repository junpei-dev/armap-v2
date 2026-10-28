import { useCallback, useEffect, useState } from 'react'
import { fetchHistory, type HistoryEntry, undoHistory } from '../api/admin.ts'
import { useAdmin } from './AdminContext.tsx'

// 変更履歴と「元に戻す」（要件 F-57）

const TABLE_LABELS: Record<string, string> = {
  buildings: '棟',
  nodes: 'ノード',
  edges: '辺',
  rooms: '部屋',
  checkpoints: 'チェックポイント',
  survey: '調査メモ',
}
const FIELD_LABELS: Record<string, string> = {
  name: '名前',
  drawingName: '図面上の名前',
  aliases: '別名',
  building: '棟',
  floor: '階',
  floors: '階数',
  kind: '種類',
  local: 'u・v',
  pos: '位置',
  landmark: '目印',
  node: 'ノード',
  category: '分類',
  description: '説明',
  visible: '一覧に出す',
  facing: '掲示面の向き',
  place: '掲示場所',
  closed: '通行止め',
  oneway: '一方通行',
  text: 'メモ',
  resolved: '対応済み',
  outline: '外形',
  origin: '基準点',
  rotation: '向き',
}
const ACTION_LABELS: Record<string, string> = { insert: '追加', update: '修正', delete: '削除', undo: '元に戻す' }

export default function HistoryPage() {
  const { reload, notify } = useAdmin()
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null)
  const [busy, setBusy] = useState<number | null>(null)

  const load = useCallback(async () => {
    try {
      setEntries(await fetchHistory())
    } catch (e) {
      notify((e as Error).message)
    }
  }, [notify])

  useEffect(() => {
    load()
  }, [load])

  async function undo(h: HistoryEntry) {
    if (!confirm(`「${TABLE_LABELS[h.table] ?? h.table} ${h.recordId} の${ACTION_LABELS[h.action] ?? h.action}」を元に戻しますか？`)) return
    setBusy(h.id)
    try {
      await undoHistory(h.id)
      notify('元に戻しました')
      await Promise.all([reload(), load()])
    } catch (e) {
      const err = e as Error & { issues?: { target: string; message: string }[] }
      notify(err.message, (err.issues ?? []).map((i) => ({ level: 'fatal' as const, ...i })))
    } finally {
      setBusy(null)
    }
  }

  if (!entries) return <p>読み込み中…</p>
  return (
    <section className="panel" style={{ maxWidth: 1000 }}>
      <h2>
        変更履歴（新しい順・{entries.length}件） <button type="button" className="link" onClick={load}>読み込み直す</button>
      </h2>
      <p className="hint">
        間違えた変更は「元に戻す」で取り消せます。元に戻した操作も履歴に残るので、さらに戻すこともできます。
        ほかの人の変更とぶつかる場合は、元に戻せないことがあります。
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table className="data">
          <thead>
            <tr>
              <th>日時</th>
              <th>だれが</th>
              <th>なにを</th>
              <th>どうした</th>
              <th>内容</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((h) => (
              <tr key={h.id} style={{ cursor: 'default' }}>
                <td style={{ whiteSpace: 'nowrap' }}>{formatTime(h.at)}</td>
                <td>{h.user.split('@')[0]}</td>
                <td>
                  {TABLE_LABELS[h.table] ?? h.table} {h.recordId}
                </td>
                <td>{ACTION_LABELS[h.action] ?? h.action}</td>
                <td className="hint" style={{ maxWidth: 320 }}>
                  {summary(h)}
                </td>
                <td>
                  <button type="button" className="secondary" disabled={busy !== null} onClick={() => undo(h)}>
                    {busy === h.id ? '処理中…' : '元に戻す'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/** 変更の中身を短く説明する（修正なら、変わった項目だけ） */
function summary(h: HistoryEntry): string {
  const b = (h.before ?? {}) as Record<string, unknown>
  const a = (h.after ?? {}) as Record<string, unknown>
  if (h.action === 'update') {
    const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter(
      (k) => JSON.stringify(b[k]) !== JSON.stringify(a[k]),
    )
    return keys.map((k) => `${FIELD_LABELS[k] ?? k}: ${short(b[k])} → ${short(a[k])}`).join(' ／ ') || '（変更なし）'
  }
  const v = h.action === 'delete' ? b : a
  return ['name', 'landmark', 'text', 'place', 'kind'].map((k) => v[k]).filter(Boolean).map(short).join(' ・ ')
}

function short(v: unknown): string {
  if (v === undefined || v === null) return '（なし）'
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return s.length > 40 ? `${s.slice(0, 40)}…` : s
}

function formatTime(utc: string): string {
  const d = new Date(utc.replace(' ', 'T') + 'Z')
  return Number.isNaN(d.getTime()) ? utc : d.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
}
