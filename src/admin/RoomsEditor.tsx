import { useMemo, useState } from 'react'
import { reachableFrom } from '../core/campus.ts'
import { ROOM_CATEGORIES, ROOM_CATEGORY_LABELS, type Room } from '../types.ts'
import { useAdmin } from './AdminContext.tsx'

// 部屋（目的地）の一覧と編集（要件 F-51、設計書 7.4）

const EMPTY: Room = {
  id: '',
  name: '',
  drawingName: '',
  aliases: [],
  building: '1',
  floor: 1,
  node: '',
  category: 'admin',
  visible: true,
}

export default function RoomsEditor() {
  const { data } = useAdmin()
  const [editing, setEditing] = useState<{ room: Room; isNew: boolean } | null>(null)
  const reachable = useMemo(
    () => (data.startNode ? reachableFrom(data.startNode, data.edges) : new Set<string>()),
    [data.startNode, data.edges],
  )

  return (
    <div className="split">
      <section className="panel">
        <h2>
          部屋の一覧（{data.rooms.length}室）{' '}
          <button type="button" className="link" onClick={() => setEditing({ room: { ...EMPTY }, isNew: true })}>
            ＋ 部屋を追加
          </button>
        </h2>
        <div style={{ overflowX: 'auto' }}>
          <table className="data">
            <thead>
              <tr>
                <th>来校者向けの名前</th>
                <th>図面上の名前</th>
                <th>棟・階</th>
                <th>来校者の一覧</th>
              </tr>
            </thead>
            <tbody>
              {data.rooms.map((r) => (
                <tr
                  key={r.id}
                  className={editing?.room.id === r.id ? 'selected' : ''}
                  onClick={() => setEditing({ room: r, isNew: false })}
                >
                  <td>{r.name}</td>
                  <td>{r.drawingName}</td>
                  <td>
                    {r.building}棟 {r.floor}階
                  </td>
                  <td>{!r.visible ? '非表示' : reachable.has(r.node) ? '表示' : '経路なし'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.rooms.length === 0 && <p className="hint">まだ部屋がありません。「＋ 部屋を追加」から登録してください。</p>}
      </section>

      {editing && (
        <RoomForm
          key={editing.isNew ? 'new' : editing.room.id}
          initial={editing.room}
          isNew={editing.isNew}
          onDone={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function RoomForm({ initial, isNew, onDone }: { initial: Room; isNew: boolean; onDone: () => void }) {
  const { data, saveAndReload } = useAdmin()
  const [v, setV] = useState<Room>(initial)
  const [aliases, setAliases] = useState(initial.aliases.join('、'))
  const [saving, setSaving] = useState(false)
  const building = data.buildings.find((b) => b.id === v.building)

  // 入口の候補: 同じ棟・同じ階のノード（扉のノードを先に）
  const candidates = data.nodes
    .filter((n) => n.building === v.building && n.floor === v.floor)
    .sort((a, b) => Number(b.kind === 'door') - Number(a.kind === 'door') || a.id.localeCompare(b.id))

  async function submit() {
    setSaving(true)
    const room: Room = {
      ...v,
      id: v.id || nextRoomId(data.rooms.map((r) => r.id), v.building, v.floor),
      aliases: aliases
        .split(/[、,，\s]+/)
        .map((a) => a.trim())
        .filter(Boolean),
    }
    const r = await saveAndReload('rooms', isNew ? 'insert' : 'update', room, `部屋「${room.name}」を保存しました`)
    setSaving(false)
    if (r.ok) onDone()
  }

  async function remove() {
    if (!confirm(`部屋「${v.name}」を削除しますか？`)) return
    const r = await saveAndReload('rooms', 'delete', v.id, `部屋「${v.name}」を削除しました`)
    if (r.ok) onDone()
  }

  return (
    <section className="panel">
      <h2>{isNew ? '新しい部屋' : `部屋「${initial.name}」`}</h2>
      <div className="form">
        <label>
          来校者向けの名前
          <input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="例: 機械科 職員室" />
        </label>
        <label>
          図面上の名前
          <input value={v.drawingName} onChange={(e) => setV({ ...v, drawingName: e.target.value })} placeholder="例: 準備室" />
        </label>
        <label>
          別名（検索用。「、」で区切る）
          <input value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="例: 機械科、機械" />
        </label>
        <div className="row">
          <label>
            棟
            <select value={v.building} onChange={(e) => setV({ ...v, building: e.target.value, floor: 1, node: '' })}>
              {data.buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.id} {b.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            階
            <select value={v.floor} onChange={(e) => setV({ ...v, floor: Number(e.target.value), node: '' })}>
              {Array.from({ length: building?.floors ?? 1 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}階
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          入口のノード（案内の終点）
          <select value={v.node} onChange={(e) => setV({ ...v, node: e.target.value })}>
            <option value="">（選んでください）</option>
            {candidates.map((n) => (
              <option key={n.id} value={n.id}>
                {n.id} {n.landmark ?? ''}
              </option>
            ))}
          </select>
        </label>
        {candidates.length === 0 && (
          <p className="hint">この棟・階にはノードがまだありません。先に地図エディタで「部屋の入口」のノードを置いてください。</p>
        )}
        <label>
          分類
          <select value={v.category} onChange={(e) => setV({ ...v, category: e.target.value as Room['category'] })}>
            {ROOM_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {ROOM_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <label>
          到着したときの一言（なくてもよい）
          <input value={v.description ?? ''} onChange={(e) => setV({ ...v, description: e.target.value })} />
        </label>
        <label className="check">
          <input type="checkbox" checked={v.visible} onChange={(e) => setV({ ...v, visible: e.target.checked })} />
          来校者の目的地一覧に出す
        </label>
        <div className="buttons">
          <button type="button" className="primary" onClick={submit} disabled={saving || !v.node || !v.name}>
            {saving ? '保存中…' : isNew ? '追加する' : '保存する'}
          </button>
          <button type="button" className="secondary" onClick={onDone}>
            閉じる
          </button>
          {!isNew && (
            <button type="button" className="danger" onClick={remove}>
              削除
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

/** 部屋IDの提案。例: R-28-1F-01 */
function nextRoomId(existing: string[], building: string, floor: number): string {
  const ids = new Set(existing)
  for (let i = 1; ; i++) {
    const id = `R-${building}-${floor}F-${String(i).padStart(2, '0')}`
    if (!ids.has(id)) return id
  }
}
