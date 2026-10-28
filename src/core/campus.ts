import type { Building, BuildingPlacement, CampusRaw, Edge, GraphNode, PlacedNode, Point } from '../types.ts'
import { globalToLocal, localToGlobal } from './geometry.ts'

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
