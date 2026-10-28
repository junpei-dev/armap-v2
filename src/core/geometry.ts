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
