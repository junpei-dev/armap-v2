import type { CampusConfig, Checkpoint, Edge, NodeKind, PlacedNode } from '../types.ts'
import { angleDiff, distance, planAngle } from './geometry.ts'

// 経路案内の計算（設計書 6.1〜6.4）
// React に依存しない純粋な関数。tests/route.test.ts でテストする
//
//   findPath   … ダイクストラ法で、出発点から目的地までのノードの並びを求める
//   buildSteps … ノードの並びを「次へ」1回分の区間（ステップ）に分け、案内文を作る

/** 階段1階分を何mの遠回りとみなすか（なるべく階段を使わない経路を選ばせる） */
export const STAIRS_PENALTY_M = 10
/** この角度以上曲がる所で区間を区切る */
export const TURN_THRESHOLD_DEG = 30

/** 区間の終わりでする動作 */
export type Action =
  | { type: 'turn'; dir: 'straight' | 'right' | 'left' | 'back' }
  | { type: 'stairs'; toFloor: number; up: boolean }
  | { type: 'arrive' }

export type Step = {
  nodes: PlacedNode[] // この区間で通るノード（始点と終点を含む）
  from: PlacedNode
  to: PlacedNode
  distance: number // この区間で歩く距離（m）
  action: Action // 区間の終わり（to）でする動作
  floor: number // この区間を歩く階
  checkpoint?: string // 終点にQRチェックポイントがあればそのID
  text: string // 案内文
}

export type Route = {
  nodes: PlacedNode[]
  steps: Step[]
  distance: number // 歩く距離の合計（m・階段の上り下りは含まない）
  floorsClimbed: number // 上り下りした階の数
  seconds: number // 所要時間の見積もり（秒）
}

// ---------------------------------------------------------------
// 経路探索（ダイクストラ法・設計書 6.1）
// ---------------------------------------------------------------

/** 辺の重み: 2点間の距離。階が変わる辺は 1階あたり STAIRS_PENALTY_M を足す */
export function edgeCost(a: PlacedNode, b: PlacedNode): number {
  return distance(a.pos, b.pos) + Math.abs(a.floor - b.floor) * STAIRS_PENALTY_M
}

/**
 * start から goal までの最短経路のノードIDの並びを返す。行けなければ null
 * 通行止め（closed）の辺は通らない。一方通行（oneway）は from → to の向きだけ通れる
 */
export function findPath(nodes: PlacedNode[], edges: Edge[], start: string, goal: string): string[] | null {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  if (!byId.has(start) || !byId.has(goal)) return null

  // 隣のノードと、そこまでの重み
  const adj = new Map<string, { to: string; cost: number }[]>()
  const link = (from: string, to: string) => {
    const a = byId.get(from)
    const b = byId.get(to)
    if (!a || !b) return
    if (!adj.has(from)) adj.set(from, [])
    adj.get(from)!.push({ to, cost: edgeCost(a, b) })
  }
  for (const e of edges) {
    if (e.closed) continue
    link(e.from, e.to)
    if (!e.oneway) link(e.to, e.from)
  }

  // dist: 出発点からの最短距離、prev: 1つ前のノード
  const dist = new Map<string, number>([[start, 0]])
  const prev = new Map<string, string>()
  const done = new Set<string>()
  // ノードは数百個なので、毎回いちばん近いものを探す素朴な方法で十分速い
  while (true) {
    let current: string | null = null
    let best = Infinity
    for (const [id, d] of dist) {
      if (!done.has(id) && d < best) {
        best = d
        current = id
      }
    }
    if (current === null) return null // もう行ける所がない
    if (current === goal) break
    done.add(current)
    for (const { to, cost } of adj.get(current) ?? []) {
      const nd = best + cost
      if (nd < (dist.get(to) ?? Infinity)) {
        dist.set(to, nd)
        prev.set(to, current)
      }
    }
  }

  const path = [goal]
  while (path[0] !== start) path.unshift(prev.get(path[0])!)
  return path
}

// ---------------------------------------------------------------
// 区間への分割と案内文（設計書 6.2〜6.4）
// ---------------------------------------------------------------

/** 曲がる角度から、曲がる方向を決める（設計書 6.3） */
export function turnDirection(incoming: number, outgoing: number): 'straight' | 'right' | 'left' | 'back' {
  const d = angleDiff(incoming, outgoing)
  if (Math.abs(d) < TURN_THRESHOLD_DEG) return 'straight'
  if (Math.abs(d) >= 150) return 'back'
  return d > 0 ? 'right' : 'left'
}

/** 距離を案内用に丸める（5m単位。5m未満は「すぐ」） */
export function roundDistance(m: number): number {
  return m < 2.5 ? 0 : Math.max(5, Math.round(m / 5) * 5)
}

const DEFAULT_LANDMARK: Record<NodeKind, string> = {
  corridor: '次の角',
  door: '部屋の入口',
  entrance: '出入口',
  stairs: '階段',
  outdoor: '次の角',
}

function actionText(a: Action): string {
  switch (a.type) {
    case 'arrive':
      return '到着です'
    case 'stairs':
      return `階段で${a.toFloor}階へ${a.up ? '上ります' : '下ります'}`
    case 'turn':
      return { straight: 'そのまま進みます', right: '右へ曲がります', left: '左へ曲がります', back: '引き返します' }[a.dir]
  }
}

/** 案内文（設計書 6.4）。例: 「ホール横の階段まで 約20m 進み、階段で2階へ上ります」 */
export function stepText(step: Pick<Step, 'to' | 'distance' | 'action'>, destinationName?: string): string {
  const target =
    step.action.type === 'arrive' && destinationName ? destinationName : (step.to.landmark ?? DEFAULT_LANDMARK[step.to.kind])
  const d = roundDistance(step.distance)
  if (step.action.type === 'arrive') {
    return d === 0 ? `ここが${target}です` : `約${d}m 進むと、${target}に着きます`
  }
  if (d === 0) {
    // 階段の上り下りは「階段で、階段で…」と重ならないよう、動作だけを言う
    return step.action.type === 'stairs' ? actionText(step.action) : `${target}で、${actionText(step.action)}`
  }
  return `${target}まで 約${d}m 進み、${actionText(step.action)}`
}

/**
 * ノードの並びを区間に分ける
 * 区間の切れ目: 30度以上曲がる所・棟の出入口・階段（階が変わる所）・QRチェックポイント・目的地
 * 階段の上り下りは独立した区間にせず、手前の区間の動作「階段で○階へ」にまとめる
 */
export function buildSteps(
  path: PlacedNode[],
  checkpoints: Checkpoint[] = [],
  destinationName?: string,
): Step[] {
  const cpByNode = new Map(checkpoints.map((c) => [c.node, c.id]))
  const steps: Step[] = []
  if (path.length === 0) return steps
  if (path.length === 1) {
    const only = path[0]
    const step = { nodes: [only], from: only, to: only, distance: 0, action: { type: 'arrive' } as Action, floor: only.floor }
    return [{ ...step, text: stepText(step, destinationName) }]
  }

  const changesFloor = (i: number) => i + 1 < path.length && path[i].floor !== path[i + 1].floor
  let i = 0
  // 出発点がいきなり階段の上り下りなら、階段の区間を先に作る
  while (i < path.length - 1) {
    if (changesFloor(i)) {
      // 階段を続けて上り下りする所はまとめる（1階→3階 など）
      let j = i
      while (changesFloor(j)) j++
      const from = path[i]
      const to = path[j]
      const action: Action = { type: 'stairs', toFloor: to.floor, up: to.floor > from.floor }
      if (steps.length === 0) {
        // 先頭で階段から始まるときだけ、0m の区間として出す
        const step = { nodes: path.slice(i, j + 1), from, to: from, distance: 0, action, floor: from.floor }
        steps.push({ ...step, text: stepText(step, destinationName) })
      } else {
        // 直前の区間の動作を「階段で○階へ」にする
        const last = steps[steps.length - 1]
        last.action = action
        last.nodes = [...last.nodes, ...path.slice(i + 1, j + 1)]
        last.text = stepText(last, destinationName)
      }
      i = j
      continue
    }

    // 同じ階を歩く区間: 次の切れ目まで進む
    const startIndex = i
    let walked = 0
    let k = i + 1
    while (true) {
      walked += distance(path[k - 1].pos, path[k].pos)
      const node = path[k]
      const isLast = k === path.length - 1
      const isBreak =
        isLast ||
        changesFloor(k) ||
        node.kind === 'entrance' ||
        cpByNode.has(node.id) ||
        (path[k + 1] &&
          turnDirection(planAngle(path[k - 1].pos, node.pos), planAngle(node.pos, path[k + 1].pos)) !== 'straight')
      if (isBreak) break
      k++
    }

    const from = path[startIndex]
    const to = path[k]
    let action: Action
    if (k === path.length - 1) action = { type: 'arrive' }
    else if (changesFloor(k)) action = { type: 'stairs', toFloor: path[k + 1].floor, up: path[k + 1].floor > to.floor }
    else action = { type: 'turn', dir: turnDirection(planAngle(path[k - 1].pos, to.pos), planAngle(to.pos, path[k + 1].pos)) }

    const step: Omit<Step, 'text'> = {
      nodes: path.slice(startIndex, k + 1),
      from,
      to,
      distance: walked,
      action,
      floor: from.floor,
      ...(cpByNode.has(to.id) ? { checkpoint: cpByNode.get(to.id) } : {}),
    }
    steps.push({ ...step, text: stepText(step, destinationName) })
    i = k
  }
  return steps
}

/** 経路を求めて、区間・距離・所要時間までまとめて返す。行けなければ null */
export function planRoute(
  nodes: PlacedNode[],
  edges: Edge[],
  checkpoints: Checkpoint[],
  config: Pick<CampusConfig, 'walkSpeed' | 'stairSeconds'>,
  start: string,
  goal: string,
  destinationName?: string,
): Route | null {
  const ids = findPath(nodes, edges, start, goal)
  if (!ids) return null
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const path = ids.map((id) => byId.get(id)!)

  let walk = 0
  let floors = 0
  for (let i = 1; i < path.length; i++) {
    if (path[i].floor !== path[i - 1].floor) floors += Math.abs(path[i].floor - path[i - 1].floor)
    else walk += distance(path[i - 1].pos, path[i].pos)
  }
  return {
    nodes: path,
    steps: buildSteps(path, checkpoints, destinationName),
    distance: walk,
    floorsClimbed: floors,
    seconds: walk / config.walkSpeed + floors * config.stairSeconds,
  }
}

/**
 * 全体マップの下に出す「通る主な目印」（要件 F-17）
 * 例: ["北側の出入口を通る", "ホール横の階段で2階へ"]
 */
export function routeHighlights(route: Route, max = 3): string[] {
  const out: string[] = []
  for (const s of route.steps) {
    if (s.action.type === 'stairs') {
      out.push(`${s.to.landmark ?? '階段'}で${s.action.toFloor}階へ`)
    } else if (s.to.kind === 'entrance' && s.action.type !== 'arrive') {
      out.push(`${s.to.landmark ?? '出入口'}を通る`)
    }
  }
  return [...new Set(out)].slice(0, max)
}

/** 所要時間を「約○分」にする（1分未満も「約1分」） */
export function minutesText(seconds: number): string {
  return `約${Math.max(1, Math.round(seconds / 60))}分`
}

/**
 * 最初にどちらへ歩き出すか（QRの地点から出発するとき）
 * QRは壁に貼ってあり、掲示面の向き（facing）は壁から外へ向かう方向。
 * 利用者が「QR（壁）を背にして立つ」と、利用者の向き = facing。
 * そこから最初の区間の向きへの差で「右へ」「左へ」などを決める。
 * 例: 「事務室の窓口を背にして、右へ進みます」
 */
export function startHint(route: Route, checkpoints: Checkpoint[]): string | null {
  const start = route.nodes[0]
  const cp = checkpoints.find((c) => c.node === start.id)
  // 最初に同じ階で動く区間（出発点から少しでも動くもの）を探す
  const next = route.nodes.find((n, i) => i > 0 && n.floor === start.floor && distance(start.pos, n.pos) > 0.5)
  if (!cp || !next) return null
  const dir = turnDirection(cp.facing, planAngle(start.pos, next.pos))
  const where = start.landmark ?? cp.place
  const word = { straight: 'まっすぐ進みます', right: '右へ進みます', left: '左へ進みます', back: '壁の方へ進みます' }[dir]
  return `${where}を背にして、${word}`
}

/**
 * QRを読んだ地点が、経路のどの区間にあたるか（要件 F-30・F-32）
 * ・その地点から始まる区間があればその番号
 * ・区間の途中にあればその区間の番号
 * ・経路の上に無ければ null（呼び出し側で、その地点から経路を引き直す）
 */
export function stepForNode(route: Route, nodeId: string): number | null {
  const starts = route.steps.findIndex((s) => s.from.id === nodeId)
  if (starts >= 0) return starts
  const inside = route.steps.findIndex((s) => s.nodes.slice(0, -1).some((n) => n.id === nodeId))
  if (inside >= 0) return inside
  // 目的地そのもの
  const last = route.steps.length - 1
  return route.steps[last]?.to.id === nodeId ? last : null
}

/** 今の区間で、最初に進む向き（図面角度）。カメラ表示の矢印に使う。動かない区間なら null */
export function stepBearing(step: Step): number | null {
  for (let i = 1; i < step.nodes.length; i++) {
    const a = step.nodes[i - 1]
    const b = step.nodes[i]
    if (a.floor === b.floor && distance(a.pos, b.pos) > 0.5) return planAngle(a.pos, b.pos)
  }
  return null
}
