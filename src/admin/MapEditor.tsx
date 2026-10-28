import { useEffect, useMemo, useState } from 'react'
import CampusMap, { useMapScale } from '../components/CampusMap.tsx'
import { inputFromTap, nodePosition, placeNodes, suggestNodeId } from '../core/campus.ts'
import { distance, distanceToSegment, pointInPolygon } from '../core/geometry.ts'
import {
  type Building,
  type Edge,
  type GraphNode,
  NODE_KIND_LABELS,
  NODE_KINDS,
  type NodeKind,
  type PlacedNode,
  type Point,
} from '../types.ts'
import { useAdmin } from './AdminContext.tsx'
import { NoteMark } from './SurveyNotes.tsx'

// 地図エディタ（要件 F-52・F-53、設計書 7.4）
// モード: 選択 / ノード追加 / 辺（2つのノードをつなぐ） / 削除

type Mode = 'select' | 'add' | 'edge' | 'delete'
const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'select', label: '選択', hint: 'ノードをタップすると、右の欄で直せます' },
  { id: 'add', label: 'ノード追加', hint: 'ノードを置きたい場所をタップしてください（棟の中なら、その棟のノードになります）' },
  { id: 'edge', label: '辺', hint: 'つなぎたい2つのノードを順にタップします。階段は、下の階の階段 → 階を切り替え → 上の階の階段' },
  { id: 'delete', label: '削除', hint: '消したいノードか辺をタップしてください' },
]

export default function MapEditor() {
  const { data, saveAndReload } = useAdmin()
  const [mode, setMode] = useState<Mode>('select')
  const [floor, setFloor] = useState(1)
  const [focus, setFocus] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<GraphNode | null>(null)
  const [edgeFrom, setEdgeFrom] = useState<string | null>(null)
  const [scale, setScale] = useState(1) // 画面1ピクセルが何mか（タップの判定に使う）

  const buildings = useMemo(() => new Map(data.buildings.map((b) => [b.id, b])), [data.buildings])
  const placed = useMemo(() => placeNodes(data), [data])
  const placedById = useMemo(() => new Map(placed.map((n) => [n.id, n])), [placed])
  const maxFloor = Math.max(1, ...data.buildings.map((b) => b.floors))
  const onFloor = (n: GraphNode) => n.floor === floor

  /** タップした位置に一番近いノード（12ピクセル以内） */
  function nodeAt(p: Point, anyFloor: boolean): PlacedNode | undefined {
    let best: PlacedNode | undefined
    let bestD = 12 * scale
    for (const n of placed) {
      if (!anyFloor && !onFloor(n)) continue
      const d = distance(p, n.pos)
      if (d < bestD) {
        best = n
        bestD = d
      }
    }
    return best
  }

  /** タップした位置に一番近い辺（8ピクセル以内） */
  function edgeAt(p: Point): Edge | undefined {
    let best: Edge | undefined
    let bestD = 8 * scale
    for (const e of data.edges) {
      const a = placedById.get(e.from)
      const b = placedById.get(e.to)
      if (!a || !b || (!onFloor(a) && !onFloor(b))) continue
      const d = distanceToSegment(p, a.pos, b.pos)
      if (d < bestD) {
        best = e
        bestD = d
      }
    }
    return best
  }

  async function onTap(p: Point) {
    if (mode === 'add') {
      const b = data.buildings.find((x) => pointInPolygon(p, x.outline))
      const f = b ? Math.min(floor, b.floors) : 1
      const kind: NodeKind = b ? 'corridor' : 'outdoor'
      const ids = new Set(data.nodes.map((n) => n.id))
      setSelectedId(null)
      setDraft({
        id: suggestNodeId(ids, b?.id, f, NODE_KIND_LABELS[kind].code),
        building: b?.id,
        floor: f,
        kind,
        ...inputFromTap(p, b),
      })
      return
    }
    if (mode === 'select') {
      const n = nodeAt(p, false)
      setDraft(null)
      setSelectedId(n?.id ?? null)
      return
    }
    if (mode === 'edge') {
      const n = nodeAt(p, true)
      if (!n) return
      if (!edgeFrom) {
        setEdgeFrom(n.id)
        return
      }
      if (edgeFrom === n.id) {
        setEdgeFrom(null)
        return
      }
      const a = data.nodes.find((x) => x.id === edgeFrom)!
      const edge: Edge = { from: edgeFrom, to: n.id, kind: a.floor !== n.floor ? 'stairs' : 'walk', oneway: false, closed: false }
      const r = await saveAndReload('edges', 'insert', edge, `${edgeFrom} と ${n.id} をつなぎました`)
      // 続けて次の辺を引けるよう、つないだ先を次の始点にする
      if (r.ok) setEdgeFrom(n.id)
      return
    }
    if (mode === 'delete') {
      const n = nodeAt(p, false)
      if (n) {
        await deleteNode(n.id)
        return
      }
      const e = edgeAt(p)
      if (e && confirm(`辺 ${e.from} → ${e.to} を削除しますか？`)) {
        await saveAndReload('edges', 'delete', e.id, '辺を削除しました')
      }
    }
  }

  /** ノードを消す。つながっている辺があれば、確認してから先に消す */
  async function deleteNode(id: string) {
    const linked = data.edges.filter((e) => e.from === id || e.to === id)
    const usedByRoom = data.rooms.filter((r) => r.node === id)
    const usedByCp = data.checkpoints.filter((c) => c.node === id)
    if (usedByRoom.length > 0 || usedByCp.length > 0) {
      alert(
        `このノードは ${[...usedByRoom.map((r) => `部屋「${r.name}」`), ...usedByCp.map((c) => `チェックポイント ${c.id}`)].join('・')} が使っているので消せません。先にそちらを直してください。`,
      )
      return
    }
    const msg = linked.length > 0 ? `ノード ${id} と、つながっている辺 ${linked.length}本を削除しますか？` : `ノード ${id} を削除しますか？`
    if (!confirm(msg)) return
    for (const e of linked) {
      const r = await saveAndReload('edges', 'delete', e.id, '辺を削除しました')
      if (!r.ok) return
    }
    const r = await saveAndReload('nodes', 'delete', id, `ノード ${id} を削除しました`)
    if (r.ok && selectedId === id) setSelectedId(null)
  }

  const selected = selectedId ? data.nodes.find((n) => n.id === selectedId) : undefined
  const modeInfo = MODES.find((m) => m.id === mode)!

  return (
    <div className="split">
      <div>
        <div className="toolbar">
          <div className="seg" role="radiogroup" aria-label="モード">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                className={m.id === mode ? 'on' : ''}
                onClick={() => {
                  setMode(m.id)
                  setEdgeFrom(null)
                  setDraft(null)
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
          <label>
            階{' '}
            <select value={floor} onChange={(e) => setFloor(Number(e.target.value))}>
              {Array.from({ length: maxFloor }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}階{i === 0 ? '・屋外' : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            担当の棟{' '}
            <select value={focus} onChange={(e) => setFocus(e.target.value)}>
              <option value="">（なし）</option>
              {data.buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.id} {b.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="hint">
          {modeInfo.hint}
          {mode === 'edge' && edgeFrom && (
            <>
              {' '}
              ／ 始点: <b>{edgeFrom}</b>{' '}
              <button type="button" className="link" onClick={() => setEdgeFrom(null)}>
                やめる
              </button>
            </>
          )}
        </p>
        <CampusMap buildings={data.buildings} focus={focus || undefined} onTap={onTap} height="min(70vh, 640px)">
          <ScaleProbe onScale={setScale} />
          <EdgesLayer edges={data.edges} placedById={placedById} floor={floor} />
          {data.survey.filter((s) => !s.resolved && s.floor === floor).map((s) => (
            <NoteMark key={s.id} note={s} />
          ))}
          <NodesLayer
            nodes={placed}
            floor={floor}
            selected={draft ? null : (selectedId ?? edgeFrom)}
            startNode={data.startNode}
          />
          {draft && <DraftNode node={draft} building={draft.building ? buildings.get(draft.building) : undefined} />}
        </CampusMap>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        {draft && (
          <NodeForm
            key={`draft-${draft.id}`}
            node={draft}
            isNew
            onDone={(id) => {
              setDraft(null)
              if (id) setSelectedId(id)
            }}
          />
        )}
        {!draft && selected && (
          <>
            <NodeForm key={selected.id} node={selected} onDone={() => undefined} />
            <LinkedEdges nodeId={selected.id} onDeleteNode={() => deleteNode(selected.id)} />
          </>
        )}
        {!draft && !selected && (
          <section className="panel">
            <h2>ノード</h2>
            <p className="hint">
              {placed.filter(onFloor).length}個（{floor}階{floor === 1 ? '・屋外' : ''}）。地図のノードをタップするか、「ノード追加」で新しく置いてください。
            </p>
            <p className="hint">
              ● 濃い緑: この階のノード ／ ● 薄い色: ほかの階 ／ ◎ 二重丸: 事務室（CP01） ／ ▲: 未対応の調査メモ ／ 点線: 階段
            </p>
          </section>
        )}
      </div>
    </div>
  )
}

/** 地図の縮尺を親に知らせるだけの部品（タップの判定距離をピクセルで決めるため） */
function ScaleProbe({ onScale }: { onScale: (v: number) => void }) {
  const px = useMapScale()
  // 値が変わったときだけ知らせる
  useEffect(() => onScale(px), [px, onScale])
  return null
}

function EdgesLayer({ edges, placedById, floor }: { edges: Edge[]; placedById: Map<string, PlacedNode>; floor: number }) {
  const px = useMapScale()
  return (
    <g>
      {edges.map((e) => {
        const a = placedById.get(e.from)
        const b = placedById.get(e.to)
        if (!a || !b) return null
        const active = a.floor === floor || b.floor === floor
        return (
          <line
            key={e.id}
            x1={a.pos.x}
            y1={a.pos.y}
            x2={b.pos.x}
            y2={b.pos.y}
            stroke={e.closed ? 'var(--error)' : active ? 'var(--edge)' : 'var(--node-faint)'}
            strokeWidth={(active ? 2.5 : 1.5) * px}
            strokeDasharray={e.kind === 'stairs' ? `${4 * px} ${3 * px}` : undefined}
            opacity={active ? 0.9 : 0.5}
          />
        )
      })}
    </g>
  )
}

function NodesLayer({
  nodes,
  floor,
  selected,
  startNode,
}: {
  nodes: PlacedNode[]
  floor: number
  selected: string | null
  startNode: string | null
}) {
  const px = useMapScale()
  // ほかの階 → この階 の順に描いて、この階のノードを上に重ねる
  const sorted = [...nodes].sort((a, b) => Number(a.floor === floor) - Number(b.floor === floor))
  return (
    <g>
      {sorted.map((n) => {
        const here = n.floor === floor
        const isSel = n.id === selected
        return (
          <g key={n.id}>
            {n.id === startNode && <circle cx={n.pos.x} cy={n.pos.y} r={9 * px} fill="none" stroke="var(--node)" strokeWidth={1.5 * px} />}
            <circle
              cx={n.pos.x}
              cy={n.pos.y}
              r={(isSel ? 6.5 : 5) * px}
              fill={isSel ? 'var(--selected)' : here ? 'var(--node)' : 'var(--node-faint)'}
              stroke="#fff"
              strokeWidth={1.2 * px}
            >
              <title>
                {n.id} {n.landmark ?? ''}
              </title>
            </circle>
            {n.kind === 'stairs' && here && (
              <text x={n.pos.x} y={n.pos.y} fontSize={7 * px} fill="#fff" textAnchor="middle" dominantBaseline="central" style={{ pointerEvents: 'none' }}>
                S
              </text>
            )}
          </g>
        )
      })}
    </g>
  )
}

function DraftNode({ node, building }: { node: GraphNode; building?: Building }) {
  const px = useMapScale()
  // 下書きの位置（u・v か x・y から計算）
  const pos = nodePosition(node, new Map(building ? [[building.id, building]] : []))
  if (!pos) return null
  return <circle cx={pos.x} cy={pos.y} r={7 * px} fill="none" stroke="var(--selected)" strokeWidth={2.5 * px} />
}

/** ノードの入力欄（新しく置くとき・直すとき） */
function NodeForm({ node, isNew = false, onDone }: { node: GraphNode; isNew?: boolean; onDone: (id?: string) => void }) {
  const { data, saveAndReload } = useAdmin()
  const [v, setV] = useState<GraphNode>(node)
  const [idEdited, setIdEdited] = useState(false)
  const [saving, setSaving] = useState(false)
  const building = v.building ? data.buildings.find((b) => b.id === v.building) : undefined
  const usesLocal = Boolean(v.local)

  function update(patch: Partial<GraphNode>) {
    setV((cur) => {
      const next = { ...cur, ...patch }
      // 新しいノードで、IDを手で変えていなければ、種類・階に合わせてIDを付け直す
      if (isNew && !idEdited && (patch.kind || patch.floor)) {
        const ids = new Set(data.nodes.map((n) => n.id))
        next.id = suggestNodeId(ids, next.building, next.floor, NODE_KIND_LABELS[next.kind].code)
      }
      return next
    })
  }

  async function submit() {
    setSaving(true)
    const r = await saveAndReload('nodes', isNew ? 'insert' : 'update', v, isNew ? `ノード ${v.id} を追加しました` : `ノード ${v.id} を保存しました`)
    setSaving(false)
    if (r.ok) onDone(v.id)
  }

  const num = (s: string) => (s === '' ? NaN : Number(s))

  return (
    <section className="panel">
      <h2>{isNew ? '新しいノード' : `ノード ${node.id}`}</h2>
      <div className="form">
        {isNew && (
          <label>
            ID（自動で決まります。変えなくてよい）
            <input
              value={v.id}
              onChange={(e) => {
                setIdEdited(true)
                setV({ ...v, id: e.target.value.trim() })
              }}
            />
          </label>
        )}
        <label>
          種類
          <select value={v.kind} onChange={(e) => update({ kind: e.target.value as NodeKind })}>
            {NODE_KINDS.map((k) => (
              <option key={k} value={k}>
                {NODE_KIND_LABELS[k].label}
              </option>
            ))}
          </select>
        </label>
        <p className="hint">
          場所: {building ? `${building.name}（${building.id}）` : '屋外'}
        </p>
        {building && building.floors > 1 && (
          <label>
            階
            <select value={v.floor} onChange={(e) => update({ floor: Number(e.target.value) })}>
              {Array.from({ length: building.floors }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}階
                </option>
              ))}
            </select>
          </label>
        )}
        {usesLocal ? (
          <>
            <p className="hint">平面図の左上からの距離（m）。平面図の寸法から計算した値で合わせてください</p>
            <div className="row">
              <label>
                u（右へ）
                <input type="number" step="0.01" value={v.local!.u} onChange={(e) => setV({ ...v, local: { ...v.local!, u: num(e.target.value) } })} />
              </label>
              <label>
                v（下へ）
                <input type="number" step="0.01" value={v.local!.v} onChange={(e) => setV({ ...v, local: { ...v.local!, v: num(e.target.value) } })} />
              </label>
            </div>
          </>
        ) : (
          <>
            {building && <p className="hint">この棟は平面図の置き方が未設定なので、地図上の位置（x・y）で保存します</p>}
            <div className="row">
              <label>
                x（m）
                <input type="number" step="0.01" value={v.pos?.x ?? ''} onChange={(e) => setV({ ...v, pos: { x: num(e.target.value), y: v.pos?.y ?? 0 } })} />
              </label>
              <label>
                y（m）
                <input type="number" step="0.01" value={v.pos?.y ?? ''} onChange={(e) => setV({ ...v, pos: { x: v.pos?.x ?? 0, y: num(e.target.value) } })} />
              </label>
            </div>
          </>
        )}
        <label>
          目印（来校者に伝わる説明）
          <input value={v.landmark ?? ''} onChange={(e) => setV({ ...v, landmark: e.target.value })} placeholder="例: 自動販売機のある出入口" />
        </label>
        <div className="buttons">
          <button type="button" className="primary" onClick={submit} disabled={saving}>
            {saving ? '保存中…' : isNew ? '追加する' : '保存する'}
          </button>
          {isNew && (
            <button type="button" className="secondary" onClick={() => onDone()}>
              やめる
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

/** 選んだノードにつながっている辺 */
function LinkedEdges({ nodeId, onDeleteNode }: { nodeId: string; onDeleteNode: () => void }) {
  const { data, saveAndReload } = useAdmin()
  const linked = data.edges.filter((e) => e.from === nodeId || e.to === nodeId)
  return (
    <section className="panel">
      <h2>つながっている辺（{linked.length}本）</h2>
      <ul className="list">
        {linked.map((e) => {
          const other = e.from === nodeId ? e.to : e.from
          return (
            <li key={e.id}>
              → {other}{' '}
              <span className="hint">
                {e.kind === 'stairs' ? '階段' : e.kind === 'bridge' ? '渡り廊下' : '通路'}
                {e.closed ? '・通行止め' : ''}
              </span>
              <div className="buttons" style={{ marginTop: 4 }}>
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    saveAndReload('edges', 'update', { ...e, closed: !e.closed }, e.closed ? '通れるようにしました' : '通行止めにしました')
                  }
                >
                  {e.closed ? '通れるようにする' : '通行止めにする'}
                </button>
                {e.kind !== 'stairs' && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      saveAndReload('edges', 'update', { ...e, kind: e.kind === 'bridge' ? 'walk' : 'bridge' }, '種類を変えました')
                    }
                  >
                    {e.kind === 'bridge' ? '通路にする' : '渡り廊下にする'}
                  </button>
                )}
                <button type="button" className="danger" onClick={() => saveAndReload('edges', 'delete', e.id, '辺を削除しました')}>
                  削除
                </button>
              </div>
            </li>
          )
        })}
      </ul>
      <div className="buttons" style={{ marginTop: 12 }}>
        <button type="button" className="danger" onClick={onDeleteNode}>
          このノードを削除
        </button>
      </div>
    </section>
  )
}
