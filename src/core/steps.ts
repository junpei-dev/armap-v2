import type { Point } from '../types.ts'
import type { Step } from './route.ts'

// 歩いた距離の見積もり（歩数計）と、区間の中での進み具合
//
// なぜ GPS ではなく歩数か:
//   ・GPS は屋内や建物のすぐ横では 10m 以上ずれる。この学校の区間は 5〜40m なので、役に立たない所が多い
//   ・GPS を地図に重ねるには、図面の座標と緯度経度の対応づけ（測量）が要る
//   ・歩数 × 歩幅 なら、屋内でも屋外でも同じように使え、準備も要らない
// 誤差は 1〜2割ほどあるので、区間ごとに 0 から数え直し（「次へ」やQRで合わせる）、表示は「約」「このあたり」にとどめる

/** 1歩で進む距離の見積もり（m）。スマホを見ながら歩くときの、ゆっくりめの歩幅 */
export const STRIDE_M = 0.65

const MIN_STEP_MS = 300 // これより短い間隔の揺れは、1歩と数えない（1秒に3歩強まで）
const MAX_GAP_MS = 1500 // これ以上あいたら、歩きが途切れたとみなす
const THRESHOLD = 0.9 // 1歩とみなす揺れの大きさ（m/s²・重力を除いた分）

/**
 * 加速度の大きさ（重力を含む・m/s²）を順に渡すと、1歩ごとに「増えた歩数」を返す
 * ・ゆっくり変わる成分（重力）を引き、残りの揺れが THRESHOLD を上向きに超えた所を1歩とする
 * ・手ぶれを数えないよう、続けて2歩そろって初めて数える（そのとき2歩分をまとめて返す）
 */
export function createStepDetector() {
  let gravity: number | null = null
  let smooth = 0
  let above = false
  let lastStepAt = -Infinity
  let pending = false // 1歩目を見つけたが、まだ数えていない

  return function feed(magnitude: number, timeMs: number): number {
    if (gravity === null) gravity = magnitude
    gravity = gravity * 0.92 + magnitude * 0.08
    smooth = smooth * 0.6 + (magnitude - gravity) * 0.4

    if (!above && smooth > THRESHOLD) {
      above = true
      const gap = timeMs - lastStepAt
      if (gap < MIN_STEP_MS) return 0
      lastStepAt = timeMs
      if (gap > MAX_GAP_MS) {
        // 歩き始めの1歩目: 次の1歩が続くまで保留
        pending = true
        return 0
      }
      if (pending) {
        pending = false
        return 2
      }
      return 1
    }
    if (above && smooth < THRESHOLD * 0.3) above = false
    return 0
  }
}

/** 点を結んだ道の長さ（m） */
export function pathLength(pts: Point[]): number {
  let len = 0
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
  return len
}

/** 道を始点から d（m）進んだ所までの点の並び（最後の点が、いまいる位置の見積もり） */
export function walkedPath(pts: Point[], d: number): Point[] {
  if (pts.length === 0) return []
  const out: Point[] = [pts[0]]
  let rest = Math.max(0, d)
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const seg = Math.hypot(b.x - a.x, b.y - a.y)
    if (seg === 0) continue
    if (rest >= seg) {
      out.push(b)
      rest -= seg
    } else {
      const t = rest / seg
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
      return out
    }
  }
  return out
}

/** これより近づいたら「まもなく」と知らせる（m） */
export const NEAR_M = 6

export type Progress = {
  remaining: number // 区間の終わりまでの残り（m・0以上）
  near: boolean // 区間の終わりの近くまで来た
  text: string // 「あと 約15m」「まもなく 階段 です」など
}

/** 区間の終わりにあるものの呼び名 */
export function stepTargetName(step: Step, destinationName?: string): string {
  if (step.action.type === 'arrive') return destinationName ?? '目的地'
  if (step.to.landmark) return step.to.landmark
  if (step.action.type === 'stairs') return '階段'
  return step.action.dir === 'straight' ? '次の目印' : '曲がり角'
}

/** いまの区間を walked（m）歩いたときの、残りの距離と知らせる文 */
export function stepProgress(step: Step, walked: number, destinationName?: string): Progress {
  const remaining = Math.max(0, step.distance - walked)
  const target = stepTargetName(step, destinationName)
  if (remaining > NEAR_M) {
    return { remaining, near: false, text: `あと 約${Math.max(5, Math.round(remaining / 5) * 5)}m` }
  }
  // 見積もりの距離を歩ききったあとは「このあたり」。歩数には誤差があるので、着いたかどうかは利用者が決める
  return { remaining, near: true, text: remaining > 1 ? `まもなく ${target} です` : `このあたりが ${target} です` }
}
