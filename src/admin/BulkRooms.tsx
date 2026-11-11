import { useMemo, useState } from 'react'
import { type GraphNode, ROOM_CATEGORIES, ROOM_CATEGORY_LABELS, type Room, type RoomCategory } from '../types.ts'
import { useAdmin } from './AdminContext.tsx'

// 部屋のまとめて登録（2026-11-11 追加）
// 「部屋の入口」のノードのうち、まだ部屋として登録していないものを一覧にし、
// 目印の名前から入力欄を推測して埋めておく。確認して「登録」を押すだけで済む

/** 目印の名前から、部屋の名前・図面上の名前・分類を推測する */
export function guessRoom(landmark: string): { name: string; drawingName: string; category: RoomCategory } {
  const name = landmark
    .trim()
    .replace(/(の)?(入口|入り口|出入口|前|扉|ドア)$/, '')
    .trim()
  if (/職員室/.test(name)) return { name, drawingName: '準備室', category: 'department' }
  // 「情報技術科3年」「1年2組」「機械科３年」などはクラスの教室
  if (/[0-9０-９一二三]\s*年|組/.test(name)) {
    return { name, drawingName: /選択/.test(name) ? '選択教室' : '普通教室', category: 'general' }
  }
  if (/選択/.test(name)) return { name, drawingName: '選択教室', category: 'general' }
  if (/校長室|事務室|保健室|進路指導室|会議室|応接室/.test(name)) return { name, drawingName: name, category: 'admin' }
  return { name, drawingName: name, category: 'special' }
}

type Row = { node: GraphNode; name: string; drawingName: string; category: RoomCategory }

export default function BulkRooms() {
  const { data, saveAndReload, notify } = useAdmin()
  const [edits, setEdits] = useState<Record<string, Partial<Row>>>({})
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(true)

  // 部屋に登録されていない「部屋の入口」（QRの地点・屋外は除く）
  const rows: Row[] = useMemo(() => {
    const used = new Set(data.rooms.map((r) => r.node))
    const cps = new Set(data.checkpoints.map((c) => c.node))
    return data.nodes
      .filter((n) => n.kind === 'door' && n.building && !used.has(n.id) && !cps.has(n.id))
      .sort((a, b) => (a.building! + a.floor + a.id).localeCompare(b.building! + b.floor + b.id, 'ja'))
      .map((node) => ({ node, ...guessRoom(node.landmark ?? '') }))
  }, [data])

  const rowOf = (r: Row): Row => ({ ...r, ...edits[r.node.id] })
  const setField = (id: string, patch: Partial<Row>) => setEdits((e) => ({ ...e, [id]: { ...e[id], ...patch } }))

  /** 部屋IDを決める（棟・階ごとの連番。まとめて登録するときに重ならないよう、使った番号も覚える） */
  function makeIds(list: Row[]): string[] {
    const taken = new Set(data.rooms.map((r) => r.id))
    return list.map((r) => {
      for (let i = 1; ; i++) {
        const id = `R-${r.node.building}-${r.node.floor}F-${String(i).padStart(2, '0')}`
        if (!taken.has(id)) {
          taken.add(id)
          return id
        }
      }
    })
  }

  async function register(list: Row[]) {
    const ready = list.map(rowOf).filter((r) => r.name.trim())
    if (ready.length === 0) return
    setBusy(true)
    const ids = makeIds(ready)
    let ok = 0
    for (let i = 0; i < ready.length; i++) {
      const r = ready[i]
      const room: Room = {
        id: ids[i],
        name: r.name.trim(),
        drawingName: r.drawingName.trim() || r.name.trim(),
        aliases: [],
        building: r.node.building!,
        floor: r.node.floor,
        node: r.node.id,
        category: r.category,
        visible: true,
      }
      const res = await saveAndReload('rooms', 'insert', room, `部屋「${room.name}」を登録しました`)
      if (!res.ok) break
      ok++
    }
    setBusy(false)
    if (ready.length > 1) notify(`${ok}件の部屋を登録しました${ok < ready.length ? `（${ready.length - ok}件は登録できませんでした）` : ''}`)
  }

  if (rows.length === 0) return null

  return (
    <section className="panel" style={{ gridColumn: '1 / -1' }}>
      <h2>
        部屋のまとめて登録（未登録の「部屋の入口」{rows.length}件）{' '}
        <button type="button" className="link" onClick={() => setOpen(!open)}>
          {open ? '閉じる' : '開く'}
        </button>
      </h2>
      {open && (
        <>
          <p className="hint">
            ノードの目印の名前から、入力欄を自動で埋めています。名前・図面上の名前・分類を確かめて「登録」を押してください。
            事務室の窓口などQRの地点は表示しません。目的地にしない部屋（倉庫など）は、地図エディタで種類を「廊下」に変えると、ここに出なくなります。
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>ノード</th>
                  <th>棟・階</th>
                  <th>来校者向けの名前</th>
                  <th>図面上の名前</th>
                  <th>分類</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((base) => {
                  const r = rowOf(base)
                  return (
                    <tr key={r.node.id} style={{ cursor: 'default' }}>
                      <td>
                        {r.node.id}
                        <div className="hint">{r.node.landmark ?? '（目印なし）'}</div>
                      </td>
                      <td>
                        {r.node.building}棟 {r.node.floor}階
                      </td>
                      <td>
                        <input value={r.name} onChange={(e) => setField(r.node.id, { name: e.target.value })} style={{ width: '100%' }} />
                      </td>
                      <td>
                        <input value={r.drawingName} onChange={(e) => setField(r.node.id, { drawingName: e.target.value })} style={{ width: '100%' }} />
                      </td>
                      <td>
                        <select value={r.category} onChange={(e) => setField(r.node.id, { category: e.target.value as RoomCategory })}>
                          {ROOM_CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {ROOM_CATEGORY_LABELS[c]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <button type="button" className="secondary" disabled={busy || !r.name.trim()} onClick={() => register([base])}>
                          登録
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="buttons" style={{ marginTop: 10 }}>
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() => {
                if (confirm(`表示している${rows.length}件を、この内容でまとめて登録しますか？`)) register(rows)
              }}
            >
              {busy ? '登録中…' : `${rows.length}件をまとめて登録`}
            </button>
          </div>
        </>
      )}
    </section>
  )
}
