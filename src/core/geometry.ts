import type { BuildingPlacement, LocalPoint, Point } from '../types.ts'

// 距離・角度・座標変換（設計書 4章）
// React に依存しない純粋な関数だけを置く。tests/geometry.test.ts でテストする

/** 2点間の距離（m） */
export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

/** 角度を 0以上360未満 にそろえる */
export function normalizeAngle(deg: number): number {
  return ((deg % 360) + 360) % 360
}

/**
 * a から b へ向かう図面角度（設計書 4.2）
 * 図面の上を0度、時計回りに正。y軸が下向きなので -(dy) を使う
 */
export function planAngle(a: Point, b: Point): number {
  const deg = (Math.atan2(b.x - a.x, -(b.y - a.y)) * 180) / Math.PI
  return normalizeAngle(deg)
}

/**
 * 角度の差（to - from）を -180より大きく180以下 にして返す
 * 正なら右回り（右へ曲がる）、負なら左回り
 */
export function angleDiff(from: number, to: number): number {
  const d = normalizeAngle(to - from)
  return d > 180 ? d - 360 : d
}

/** 平面図のローカル座標 (u, v) を全体座標に変換する（設計書 4.4） */
export function localToGlobal(p: LocalPoint, placement: BuildingPlacement): Point {
  const { origin, rotation } = placement
  switch (rotation) {
    case 0:
      return { x: origin.x + p.u, y: origin.y + p.v }
    case 90: // 時計回りに90度: 右(u)→下、下(v)→左
      return { x: origin.x - p.v, y: origin.y + p.u }
    case 180:
      return { x: origin.x - p.u, y: origin.y - p.v }
    case 270: // 時計回りに270度: 右(u)→上、下(v)→右
      return { x: origin.x + p.v, y: origin.y - p.u }
  }
}

/** 点が多角形の内側にあるか（境界線の上は内側とみなす。0.05m の余裕） */
export function pointInPolygon(p: Point, polygon: Point[]): boolean {
  const n = polygon.length
  // 境界線の近くなら内側
  for (let i = 0; i < n; i++) {
    if (distanceToSegment(p, polygon[i], polygon[(i + 1) % n]) < 0.05) return true
  }
  let inside = false
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = polygon[i]
    const b = polygon[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** 点と線分の距離 */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return distance(p, a)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy })
}

/** 多角形の頂点の平均（棟名を置く位置の目安） */
export function centroid(points: Point[]): Point {
  const sum = points.reduce((s, p) => ({ x: s.x + p.x, y: s.y + p.y }), { x: 0, y: 0 })
  return { x: sum.x / points.length, y: sum.y / points.length }
}

/** 全体座標をローカル座標に戻す（地図をタップしてノードを置いたときに使う） */
export function globalToLocal(p: Point, placement: BuildingPlacement): LocalPoint {
  const { origin, rotation } = placement
  const dx = p.x - origin.x
  const dy = p.y - origin.y
  switch (rotation) {
    case 0:
      return { u: dx, v: dy }
    case 90:
      return { u: dy, v: -dx }
    case 180:
      return { u: -dx, v: -dy }
    case 270:
      return { u: -dy, v: dx }
  }
}
