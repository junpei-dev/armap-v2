import { useEffect, useMemo, useState } from 'react'
import CampusMap, { NO_PAN_CLASS, useMapPoint, useMapScale, useUpright } from '../components/CampusMap.tsx'
import { buildingAt, buildingForNode, inputFromTap, nodePosition, placeNodes, round2, suggestNodeId } from '../core/campus.ts'
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

/** ノードの種類ごとの色と大きさ（2026-11-16 色分け。種類が一目で分かるように） */
export const KIND_STYLE: Record<NodeKind, { color: string; r: number; mark?: string }> = {
  corridor: { color: '#5c7f67', r: 4.5 }, // 廊下: 灰緑・小さめ
  door: { color: '#1c7ed6', r: 5.5 }, // 部屋の入口: 青
  entrance: { color: '#e8590c', r: 6 }, // 棟の出入口: 橙
  stairs: { color: '#7048e8', r: 7.5, mark: '階' }, // 階段: 紫・大きく「階」
  outdoor: { color: '#8d6e3f', r: 5 }, // 屋外: 茶
}

type Mode = 'select' | 'add' | 'edge' | 'delete'
const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'select', label: '選択', hint: 'ノードはドラッグで動かせます（隣のノードと縦・横がそろう位置に吸い付きます）。タップすると右の欄で直せます' },
  { id: 'add', label: 'ノード追加', hint: 'ノードを置きたい場所をタップしてください（棟の中なら、その棟のノードになります）' },
  { id: 'edge', label: '辺', hint: 'つなぎたい2つのノードを順にタップします。階段は、下の階の階段 → 階を切り替え → 上の階の階段' },
  { id: 'delete', label: '削除', hint: '消したいノードか辺をタップしてください' },
]

export default function MapEditor() {
  const { data, saveAndReload, focusRequest } = useAdmin()
  const [mode, setMode] = useState<Mode>('select')
  const [floor, setFloor] = useState(1)
  const [focus, setFocus] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<GraphNode | null>(null)
  const [edgeFrom, setEdgeFrom] = useState<string | null>(null)
  const [scale, setScale] = useState(1) // 画面1ピクセルが何mか（タップの判定に使う）
  const [drag, setDrag] = useState<{ id: string; pos: Point } | null>(null) // ドラッグ中のノードと位置
  // 問題の一覧の「地図で見る」で飛んできたノード（地図をそこへ拡大し、吹き出しを出す）
  const [focusNode, setFocusNode] = useState<{ id: string; seq: number } | null>(null)

  // 「地図で見る」の依頼が来たら、そのノードの階に切り替えて選び、地図を寄せる
  // （データが読み込み直されても同じ依頼で何度も飛ばないよう、依頼が変わったときだけ動く）
  useEffect(() => {
    if (!focusRequest) return
    const n = data.nodes.find((x) => x.id === focusRequest.id)
    if (!n) return
    setMode('select')
    setDraft(null)
    setEdgeFrom(null)
    setFocus('')
    setFloor(n.floor)
    setSelectedId(n.id)
    setFocusNode(focusRequest)
  }, [focusRequest]) // eslint-disable-line react-hooks/exhaustive-deps

  const buildings = useMemo(() => new Map(data.buildings.map((b) => [b.id, b])), [data.buildings])
  const savedPlaced = useMemo(() => placeNodes(data), [data])
  // ドラッグ中のノードだけ、指の位置に置きかえて描く
  const placed = useMemo(
    () => (drag ? savedPlaced.map((n) => (n.id === drag.id ? { ...n, pos: drag.pos } : n)) : savedPlaced),
    [savedPlaced, drag],
  )
  const placedById = useMemo(() => new Map(placed.map((n) => [n.id, n])), [placed])
  const maxFloor = Math.max(1, ...data.buildings.map((b) => b.floors))
  const onFloor = (n: GraphNode) => n.floor === floor

  /**
   * タップした位置に一番近いノード（12ピクセル以内）
   * 階段のように上下の階で同じ位置に重なっているときは、今選んでいる階のノードを優先する
   */
  function nodeAt(p: Point, anyFloor: boolean): PlacedNode | undefined {
    const pick = (list: PlacedNode[]) => {
      let best: PlacedNode | undefined
      let bestD = 12 * scale
      for (const n of list) {
        const d = distance(p, n.pos)
        if (d < bestD) {
          best = n
          bestD = d
        }
      }
      return best
    }
    return pick(placed.filter(onFloor)) ?? (anyFloor ? pick(placed) : undefined)
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

  /** つながっている隣のノードと、縦・横がほぼそろったら（0.6m以内）ぴったりそろえる */
  function snap(id: string, p: Point): Point {
    const node = savedPlaced.find((n) => n.id === id)
    const neighbors = data.edges
      .filter((e) => e.from === id || e.to === id)
      .map((e) => savedPlaced.find((n) => n.id === (e.from === id ? e.to : e.from)))
      .filter((n): n is PlacedNode => !!n && n.floor === node?.floor)
    let { x, y } = p
    for (const n of neighbors) {
      if (Math.abs(n.pos.x - x) < 0.6) x = n.pos.x
      if (Math.abs(n.pos.y - y) < 0.6) y = n.pos.y
    }
    return { x: round2(x), y: round2(y) }
  }

  /** ドラッグを終えた位置で保存する。棟の中なら u・v、屋外なら x・y にする */
  async function dropNode(id: string, p: Point) {
    const node = data.nodes.find((n) => n.id === id)
    if (!node) return
    // 離した位置で棟を決め直す（屋外から棟の中へ、棟から屋外へ動かしたとき）
    const b = buildingForNode(node, p, data.buildings)
    const value: GraphNode = {
      id: node.id,
      building: b?.id,
      floor: node.floor,
      kind: node.kind,
      landmark: node.landmark,
      ...inputFromTap(p, b),
    }
    const moved = (b?.id ?? '') !== (node.building ?? '')
    await saveAndReload(
      'nodes',
      'update',
      value,
      moved ? `ノード ${id} を動かし、${b ? `棟 ${b.id}（${b.name}）` : '屋外'}のノードにしました` : `ノード ${id} を動かしました`,
    )
    setDrag(null)
  }

  async function onTap(p: Point) {
    if (mode === 'add') {
      // 位置と今の階から棟を決める（渡り廊下より普通の棟を優先）。屋外（外階段・2階の通路など）は今の階で置く
      const b = buildingAt(p, data.buildings, floor) ?? data.buildings.find((x) => !x.name.includes('渡り廊下') && pointInPolygon(p, x.outline))
      const f = b ? Math.min(floor, b.floors) : floor
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
                  {i + 1}階
                </option>
              ))}
            </select>
          </label>
          <label>
            担当の棟（選ぶと拡大）{' '}
            <select
              value={focus}
              onChange={(e) => {
                setFocusNode(null)
                setFocus(e.target.value)
              }}
            >
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
        <KindLegend />
        <CampusMap
          buildings={data.buildings}
          focus={focus || undefined}
          zoomTo={focus}
          zoomToId={focusNode ? 'editor-focus' : undefined}
          zoomKey={focusNode?.seq}
          onTap={onTap}
          height="min(70vh, 640px)"
        >
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
            draggable={mode === 'select'}
            onGrab={(id) => {
              setDraft(null)
              setSelectedId(id)
            }}
            onDrag={(id, p) => setDrag({ id, pos: snap(id, p) })}
            onDrop={(id, p) => dropNode(id, snap(id, p))}
            onCancel={() => setDrag(null)}
          />
          {draft && <DraftNode node={draft} building={draft.building ? buildings.get(draft.building) : undefined} />}
          {focusNode && placedById.get(focusNode.id) && (
            <FocusCallout node={placedById.get(focusNode.id)!} show={selectedId === focusNode.id} />
          )}
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
              色はノードの種類（地図の上の凡例）。薄い色: ほかの階 ／ ◎ 二重丸: 事務室（CP01） ／ ▲: 未対応の調査メモ ／ 点線: 階段
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
  useEffect(() => {
    onScale(px)
  }, [px, onScale])
  return null
}

function EdgesLayer({ edges, placedById, floor }: { edges: Edge[]; placedById: Map<string, PlacedNode>; floor: number }) {
  const px = useMapScale()
  const upright = useUpright()
  // 階段の辺は、上下の階で同じ位置に置くので線がとても短い。点線が見えなくても分かるよう、
  // 紫の太い点線にして、真ん中に「1⇕2」のような階の印を付ける（2026-11-16）
  const stairs = KIND_STYLE.stairs.color
  return (
    <g>
      {edges.map((e) => {
        const a = placedById.get(e.from)
        const b = placedById.get(e.to)
        if (!a || !b) return null
        const active = a.floor === floor || b.floor === floor
        const isStairs = e.kind === 'stairs'
        const mid = { x: (a.pos.x + b.pos.x) / 2, y: (a.pos.y + b.pos.y) / 2 }
        const [lo, hi] = [Math.min(a.floor, b.floor), Math.max(a.floor, b.floor)]
        return (
          <g key={e.id}>
            <line
              x1={a.pos.x}
              y1={a.pos.y}
              x2={b.pos.x}
              y2={b.pos.y}
              stroke={e.closed ? 'var(--error)' : isStairs ? stairs : active ? 'var(--edge)' : 'var(--node-faint)'}
              strokeWidth={(isStairs ? 4 : active ? 2.5 : 1.5) * px}
              strokeDasharray={isStairs ? `${3 * px} ${2.5 * px}` : undefined}
              opacity={active ? 0.9 : 0.4}
            />
            {isStairs && active && (
              <g transform={upright(mid)} style={{ pointerEvents: 'none' }}>
                <rect x={mid.x + 6 * px} y={mid.y - 7 * px} width={26 * px} height={14 * px} rx={7 * px} fill={stairs} />
                <text
                  x={mid.x + 19 * px}
                  y={mid.y}
                  fontSize={9 * px}
                  fontWeight="bold"
                  fill="#fff"
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {lo}⇕{hi}
                </text>
              </g>
            )}
          </g>
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
  draggable,
  onGrab,
  onDrag,
  onDrop,
  onCancel,
}: {
  nodes: PlacedNode[]
  floor: number
  selected: string | null
  startNode: string | null
  draggable: boolean
  onGrab: (id: string) => void
  onDrag: (id: string, p: Point) => void
  onDrop: (id: string, p: Point) => void
  onCancel: () => void
}) {
  const px = useMapScale()
  const upright = useUpright()
  const toMap = useMapPoint()
  // 押した位置（3ピクセル以上動いたらドラッグとみなす）
  const [press, setPress] = useState<{ id: string; x: number; y: number; moved: boolean } | null>(null)
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
              className={draggable && here ? NO_PAN_CLASS : undefined}
              style={draggable && here ? { cursor: press?.moved ? 'grabbing' : 'grab' } : undefined}
              onPointerDown={(e) => {
                if (!draggable || !here) return
                // 地図のタップ・移動として扱わせない
                e.stopPropagation()
                // 指が円の外に出ても動きを受け取り続ける（できない環境では無視してよい）
                try {
                  e.currentTarget.setPointerCapture(e.pointerId)
                } catch {
                  /* 何もしない */
                }
                setPress({ id: n.id, x: e.clientX, y: e.clientY, moved: false })
                onGrab(n.id)
              }}
              onPointerMove={(e) => {
                if (!press || press.id !== n.id) return
                if (!press.moved && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 3) return
                if (!press.moved) setPress({ ...press, moved: true })
                const p = toMap(e.clientX, e.clientY)
                if (p) onDrag(n.id, p)
              }}
              onPointerUp={(e) => {
                if (!press || press.id !== n.id) return
                e.stopPropagation()
                const p = toMap(e.clientX, e.clientY)
                if (press.moved && p) onDrop(n.id, p)
                setPress(null)
              }}
              onPointerCancel={() => {
                // 電話の着信などで操作が中断されたら、動かす前の位置に戻す（保存しない）
                setPress(null)
                onCancel()
              }}
              cx={n.pos.x}
              cy={n.pos.y}
              r={(KIND_STYLE[n.kind].r + (isSel ? 1.5 : 0)) * px}
              fill={KIND_STYLE[n.kind].color}
              opacity={here ? 1 : 0.3}
              stroke={isSel ? 'var(--selected)' : '#fff'}
              strokeWidth={(isSel ? 3 : 1.2) * px}
            >
              <title>
                {n.id} {n.landmark ?? ''}
              </title>
            </circle>
            {KIND_STYLE[n.kind].mark && here && (
              <text
                x={n.pos.x}
                y={n.pos.y}
                transform={upright(n.pos)}
                fontSize={9 * px}
                fontWeight="bold"
                fill="#fff"
                textAnchor="middle"
                dominantBaseline="central"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {KIND_STYLE[n.kind].mark}
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
    if (r.ok && !isNew && v.floor !== node.floor) {
      // 階を変えたら、つながっている辺のうち階が食い違うものを自動で「階段」にする（外階段の入力を楽にする）
      const fix = data.edges.filter((e) => {
        if (e.kind === 'stairs' || (e.from !== v.id && e.to !== v.id)) return false
        const other = data.nodes.find((n) => n.id === (e.from === v.id ? e.to : e.from))
        return other !== undefined && other.floor !== v.floor
      })
      for (const e of fix) await saveAndReload('edges', 'update', { ...e, kind: 'stairs' }, `階を変えたので、${fix.length}本の辺を「階段」にしました`)
    }
    setSaving(false)
    if (r.ok) onDone(v.id)
  }

  const num = (s: string) => (s === '' ? NaN : Number(s))

  /** 棟を選び直す。位置はそのままで、u・v（棟の中）か x・y（屋外）に置きかえる */
  function changeBuilding(id: string) {
    const all = new Map(data.buildings.map((b) => [b.id, b]))
    const pos = nodePosition(v, all)
    const nb = id ? all.get(id) : undefined
    const next: GraphNode = { ...v, building: nb?.id, local: undefined, pos: undefined, ...(pos ? inputFromTap(pos, nb) : {}) }
    if (nb && next.floor > nb.floors) next.floor = nb.floors
    setV(next)
  }

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
        <label>
          棟（ふつうは置いた位置で自動で決まります）
          <select value={v.building ?? ''} onChange={(e) => changeBuilding(e.target.value)}>
            <option value="">屋外</option>
            {data.buildings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.id} {b.name}
              </option>
            ))}
          </select>
        </label>
        {(!building || building.floors > 1) && (
          <label>
            階{!building && '（外階段・2階の通路などは、その階を選ぶ）'}
            <select value={v.floor} onChange={(e) => update({ floor: Number(e.target.value) })}>
              {Array.from({ length: building?.floors ?? maxFloorOf(data.buildings) }, (_, i) => (
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
  const floorOf = (id: string) => data.nodes.find((n) => n.id === id)?.floor
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
                {e.kind !== 'stairs' && floorOf(e.from) !== floorOf(e.to) && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => saveAndReload('edges', 'update', { ...e, kind: 'stairs' }, '階段にしました')}
                  >
                    階段にする
                  </button>
                )}
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

/** 校地でいちばん高い棟の階数（屋外のノードで選べる階の上限） */
function maxFloorOf(buildings: Building[]): number {
  return Math.max(1, ...buildings.map((b) => b.floors))
}

/** 種類ごとの色の凡例 */
export function KindLegend() {
  return (
    <div className="legend">
      {NODE_KINDS.map((k) => (
        <span key={k}>
          <i style={{ background: KIND_STYLE[k].color }}>{KIND_STYLE[k].mark ?? ''}</i>
          {NODE_KIND_LABELS[k].label}
        </span>
      ))}
      <span>
        <i style={{ background: '#fff', border: '3px solid var(--selected)' }} />
        選んでいるノード
      </span>
    </div>
  )
}

/**
 * 「地図で見る」で飛んできたノードの目印
 * ・拡大の目印にする見えない四角（id="editor-focus"・周り15m）
 * ・広がる輪と、ID・目印の名前を書いた吹き出し（そのノードを選んでいる間だけ）
 */
function FocusCallout({ node, show }: { node: PlacedNode; show: boolean }) {
  const px = useMapScale()
  const upright = useUpright()
  const { x, y } = node.pos
  const m = 15
  const label = `${node.id}${node.landmark ? `　${node.landmark}` : ''}（${node.floor}階）`
  const w = Math.max(80, label.length * 11) * px
  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect id="editor-focus" x={x - m} y={y - m} width={m * 2} height={m * 2} fill="none" stroke="none" />
      {show && (
        <>
          <circle cx={x} cy={y} r={10 * px} fill="none" stroke="var(--selected)" strokeWidth={3 * px}>
            <animate attributeName="r" values={`${8 * px};${22 * px};${8 * px}`} dur="1.6s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="1;0.2;1" dur="1.6s" repeatCount="indefinite" />
          </circle>
          <g transform={upright(node.pos)}>
            <rect x={x - w / 2} y={y - 40 * px} width={w} height={22 * px} rx={6 * px} fill="var(--selected)" />
            <polygon points={`${x - 6 * px},${y - 18 * px} ${x + 6 * px},${y - 18 * px} ${x},${y - 10 * px}`} fill="var(--selected)" />
            <text x={x} y={y - 29 * px} fontSize={12 * px} fontWeight="bold" fill="#fff" textAnchor="middle" dominantBaseline="central">
              {label}
            </text>
          </g>
        </>
      )}
    </g>
  )
}
