import type { Building, BuildingPlacement, CampusRaw, Edge, GraphNode, PlacedNode, Point } from '../types.ts'
import { distanceToSegment, globalToLocal, localToGlobal, pointInPolygon } from './geometry.ts'

// 校地のデータを扱う共通の関数（ノードの位置・つながり）

/** 事務室のチェックポイント。経路の出発点の基準（要件 F-01） */
export const START_CHECKPOINT_ID = 'CP01'

/** 棟の平面図を置く情報（origin と rotation がそろっていれば） */
export function placementOf(building: Building | undefined): BuildingPlacement | null {
  if (!building?.origin || building.rotation === undefined) return null
  return { origin: building.origin, rotation: building.rotation }
}

/** ノードの全体座標を求める。local があれば棟の情報から計算し、無ければ pos を使う */
export function nodePosition(node: GraphNode, buildings: Map<string, Building>): Point | null {
  if (node.local) {
    const placement = placementOf(node.building ? buildings.get(node.building) : undefined)
    return placement ? localToGlobal(node.local, placement) : null
  }
  return node.pos ?? null
}

/** 全体座標をノードの入力値に直す（地図をタップしたとき）。平面図を置ける棟なら local にする */
export function inputFromTap(p: Point, building: Building | undefined): Pick<GraphNode, 'local' | 'pos'> {
  const placement = placementOf(building)
  if (placement) {
    const l = globalToLocal(p, placement)
    return { local: { u: round2(l.u), v: round2(l.v) } }
  }
  return { pos: { x: round2(p.x), y: round2(p.y) } }
}

export function round2(v: number): number {
  return Math.round(v * 100) / 100
}

/** 位置を計算できたノードだけを返す */
export function placeNodes(raw: Pick<CampusRaw, 'nodes' | 'buildings'>): PlacedNode[] {
  const buildings = new Map(raw.buildings.map((b) => [b.id, b]))
  const placed: PlacedNode[] = []
  for (const n of raw.nodes) {
    const pos = nodePosition(n, buildings)
    if (pos) placed.push({ ...n, pos: { x: round2(pos.x), y: round2(pos.y) } })
  }
  return placed
}

/** 隣り合うノードの一覧（通れない辺は除く。一方通行は from→to のみ） */
export function adjacency(edges: Edge[]): Map<string, string[]> {
  const adj = new Map<string, string[]>()
  const add = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, [])
    adj.get(a)!.push(b)
  }
  for (const e of edges) {
    if (e.closed) continue
    add(e.from, e.to)
    if (!e.oneway) add(e.to, e.from)
  }
  return adj
}

/** start から辺をたどって行けるノードの集合（幅優先探索） */
export function reachableFrom(start: string, edges: Edge[]): Set<string> {
  const adj = adjacency(edges)
  const seen = new Set([start])
  const queue = [start]
  while (queue.length > 0) {
    const id = queue.shift()!
    for (const next of adj.get(id) ?? []) {
      if (!seen.has(next)) {
        seen.add(next)
        queue.push(next)
      }
    }
  }
  return seen
}

/** 出発点のノード（事務室のチェックポイント CP01 のノード）。未登録なら null */
export function startNodeId(raw: Pick<CampusRaw, 'checkpoints'>): string | null {
  return raw.checkpoints.find((c) => c.id === START_CHECKPOINT_ID)?.node ?? null
}

/** ノードIDの提案（設計書 5.4）。例: B1-1F-C03 / OUT-12 */
export function suggestNodeId(
  existing: Set<string>,
  building: string | undefined,
  floor: number,
  code: string,
): string {
  const prefix = building ? `B${building}-${floor}F-${code}` : 'OUT-'
  for (let i = 1; ; i++) {
    const id = `${prefix}${building ? String(i).padStart(2, '0') : i}`
    if (!existing.has(id)) return id
  }
}

/** 多角形の面積（m²） */
export function polygonArea(points: Point[]): number {
  let s = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    s += a.x * b.y - b.x * a.y
  }
  return Math.abs(s) / 2
}

/** 渡り廊下の棟か（ほかの棟と重なる・接するので、判定では後回しにする） */
export function isBridge(b: Building): boolean {
  return /渡り廊下/.test(b.name + b.drawingName)
}

/**
 * 出入口のノードは壁の線の上や、渡り廊下の端に置くので、外形からこの距離までは「その棟のもの」とみなす（m）
 * 図面では渡り廊下の端と棟の壁の間に約3mの隙間があるため、4m にしている（2026-11-16 本番データで確認）
 */
export const ENTRANCE_TOLERANCE_M = 4

/** 点が多角形の中にあるか、外でも辺から tolerance 以内か */
export function nearPolygon(p: Point, polygon: Point[], tolerance: number): boolean {
  if (pointInPolygon(p, polygon)) return true
  for (let i = 0; i < polygon.length; i++) {
    if (distanceToSegment(p, polygon[i], polygon[(i + 1) % polygon.length]) <= tolerance) return true
  }
  return false
}

/**
 * その位置・その階のノードが、どの棟のものかを決める（2026-11-16）
 * ・外形の中にあり、その階がある棟が候補（渡り廊下は2階以上のときだけ）
 * ・prefer（今の棟）が候補にあればそれ
 * ・渡り廊下はほかの棟が候補にないときだけ選ぶ
 * ・それでも複数あれば、面積の小さい方（内側の棟）
 * 棟の外なら undefined（屋外）
 */
export function buildingAt(p: Point, buildings: Building[], floor: number, prefer?: string): Building | undefined {
  // 渡り廊下は2階より上にしかない。1階の渡り廊下の下は屋外とみなす
  const candidates = buildings.filter(
    (b) => b.outline.length >= 3 && floor <= b.floors && (!isBridge(b) || floor >= 2) && pointInPolygon(p, b.outline),
  )
  const preferred = candidates.find((b) => b.id === prefer)
  if (preferred) return preferred
  const normal = candidates.filter((b) => !isBridge(b))
  const list = normal.length > 0 ? normal : candidates
  return list.sort((a, b) => polygonArea(a.outline) - polygonArea(b.outline))[0]
}

/**
 * ノードを置いた（動かした）位置から、棟の設定を決める
 * 出入口・部屋の入口は、今の棟の外形から ENTRANCE_TOLERANCE_M 以内ならその棟のまま。
 * 棟の外にあるときは、ENTRANCE_TOLERANCE_M 以内の一番近い棟のものとみなす
 */
export function buildingForNode(
  node: Pick<GraphNode, 'kind' | 'floor' | 'building'>,
  p: Point,
  buildings: Building[],
): Building | undefined {
  const current = node.building ? buildings.find((b) => b.id === node.building) : undefined
  const atDoor = node.kind === 'entrance' || node.kind === 'door'
  if (atDoor && current && !(isBridge(current) && node.floor < 2) && nearPolygon(p, current.outline, ENTRANCE_TOLERANCE_M)) {
    return current
  }
  const inside = buildingAt(p, buildings, node.floor, node.building)
  if (inside || !atDoor) return inside
  // 部屋の入口・出入口が棟の少し外にあるときは、一番近い棟（4m以内）のものとみなす
  let best: Building | undefined
  let bestD = ENTRANCE_TOLERANCE_M
  for (const b of buildings) {
    if (b.outline.length < 3 || node.floor > b.floors || (isBridge(b) && node.floor < 2)) continue
    for (let i = 0; i < b.outline.length; i++) {
      const d = distanceToSegment(p, b.outline[i], b.outline[(i + 1) % b.outline.length])
      if (d <= bestD) {
        best = b
        bestD = d
      }
    }
  }
  return best
}

/** 位置と棟の設定が合っていないノードと、位置から決めた正しい棟（undefined は屋外） */
export function buildingMismatches(raw: Pick<CampusRaw, 'nodes' | 'buildings'>): { node: GraphNode; pos: Point; suggested: Building | undefined }[] {
  const byId = new Map(raw.buildings.map((b) => [b.id, b]))
  const out: { node: GraphNode; pos: Point; suggested: Building | undefined }[] = []
  for (const n of raw.nodes) {
    const pos = nodePosition(n, byId)
    if (!pos) continue
    const suggested = buildingForNode(n, pos, raw.buildings)
    if ((suggested?.id ?? undefined) !== (n.building ?? undefined)) out.push({ node: n, pos, suggested })
  }
  return out
}
