import { useState } from 'react'
import { START_CHECKPOINT_ID } from '../core/campus.ts'
import type { Checkpoint } from '../types.ts'
import { useAdmin } from './AdminContext.tsx'

// QRチェックポイントの一覧と編集（設計書 5.2・7.4）
// CP01（事務室）は経路の出発点になるので、最初に登録する
// ※ QRコードの作成・印刷は教員の依頼があったときに行う（この画面では作らない）

const EMPTY: Checkpoint = { id: '', node: '', facing: 0, place: '' }

export default function CheckpointsEditor() {
  const { data } = useAdmin()
  const [editing, setEditing] = useState<{ cp: Checkpoint; isNew: boolean } | null>(null)
  const hasStart = data.checkpoints.some((c) => c.id === START_CHECKPOINT_ID)

  function nextId(): string {
    const ids = new Set(data.checkpoints.map((c) => c.id))
    for (let i = 1; ; i++) {
      const id = `CP${String(i).padStart(2, '0')}`
      if (!ids.has(id)) return id
    }
  }

  return (
    <div className="split">
      <section className="panel">
        <h2>
          チェックポイント（{data.checkpoints.length}か所）{' '}
          <button type="button" className="link" onClick={() => setEditing({ cp: { ...EMPTY, id: nextId() }, isNew: true })}>
            ＋ 追加
          </button>
        </h2>
        {!hasStart && (
          <p className="error-text">
            事務室のチェックポイント（{START_CHECKPOINT_ID}）が未登録です。これが案内の出発点になるので、最初に登録してください。
          </p>
        )}
        <table className="data">
          <thead>
            <tr>
              <th>ID</th>
              <th>ノード</th>
              <th>掲示面の向き</th>
              <th>掲示場所</th>
            </tr>
          </thead>
          <tbody>
            {data.checkpoints.map((c) => (
              <tr key={c.id} className={editing?.cp.id === c.id ? 'selected' : ''} onClick={() => setEditing({ cp: c, isNew: false })}>
                <td>{c.id}</td>
                <td>{c.node}</td>
                <td>{c.facing}°</td>
                <td>{c.place}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {editing && (
        <CheckpointForm key={editing.cp.id} initial={editing.cp} isNew={editing.isNew} onDone={() => setEditing(null)} />
      )}
    </div>
  )
}

function CheckpointForm({ initial, isNew, onDone }: { initial: Checkpoint; isNew: boolean; onDone: () => void }) {
  const { data, saveAndReload } = useAdmin()
  const [v, setV] = useState<Checkpoint>(initial)
  const [saving, setSaving] = useState(false)

  async function submit() {
    setSaving(true)
    const r = await saveAndReload('checkpoints', isNew ? 'insert' : 'update', v, `チェックポイント ${v.id} を保存しました`)
    setSaving(false)
    if (r.ok) onDone()
  }

  return (
    <section className="panel">
      <h2>{isNew ? '新しいチェックポイント' : `チェックポイント ${v.id}`}</h2>
      <div className="form">
        {isNew && (
          <label>
            ID（{START_CHECKPOINT_ID} は事務室）
            <input value={v.id} onChange={(e) => setV({ ...v, id: e.target.value.trim().toUpperCase() })} />
          </label>
        )}
        <label>
          ノード（QRを貼る場所に一番近いノード）
          <select value={v.node} onChange={(e) => setV({ ...v, node: e.target.value })}>
            <option value="">（選んでください）</option>
            {data.nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.id} {n.landmark ?? ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          掲示面の向き（度）
          <input type="number" min={0} max={359} value={v.facing} onChange={(e) => setV({ ...v, facing: Number(e.target.value) })} />
        </label>
        <p className="hint">
          QRを貼る壁が、地図の上でどちらを向いているか。上=0、右=90、下=180、左=270。分からなければ0のままでよい（後で直せます）
        </p>
        <label>
          掲示場所の説明
          <input value={v.place} onChange={(e) => setV({ ...v, place: e.target.value })} placeholder="例: 事務室窓口の横の壁" />
        </label>
        <div className="buttons">
          <button type="button" className="primary" onClick={submit} disabled={saving || !v.node || !v.place}>
            {saving ? '保存中…' : isNew ? '追加する' : '保存する'}
          </button>
          <button type="button" className="secondary" onClick={onDone}>
            閉じる
          </button>
          {!isNew && (
            <button
              type="button"
              className="danger"
              onClick={async () => {
                if (confirm(`チェックポイント ${v.id} を削除しますか？`)) {
                  const r = await saveAndReload('checkpoints', 'delete', v.id, `チェックポイント ${v.id} を削除しました`)
                  if (r.ok) onDone()
                }
              }}
            >
              削除
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
