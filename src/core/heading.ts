import type { Point } from '../types.ts'
import { angleDiff, normalizeAngle } from './geometry.ts'

// 端末の向きと、AR表示の矢印の向き（設計書 6.6）
// React に依存しない純粋な関数。tests/heading.test.ts でテストする
//
// 考え方
//   1. 端末の傾き（deviceorientation の alpha・beta・gamma）から、
//      「背面カメラが水平面でどちらを向いているか」を角度で求める（deviceHeading）。
//      alpha の基準は端末ごとにばらばら（iPhone は起動したときの向き）なので、この角度そのものに意味はない
//   2. QRを読んだ瞬間、利用者はQRの貼られた壁を見ている。
//      壁から外へ向かう向きが facing なので、利用者（カメラ）の向き = facing + 180（図面角度）。
//      このときの deviceHeading との差を offset として覚える（anchorOffset）
//   3. その後は 図面角度での向き = deviceHeading + offset。ジャイロで回転を追うだけで、磁気は使わない
//   4. 次に進む方向（図面角度）との差だけ、矢印を回す（arrowRotation）

const RAD = Math.PI / 180

/**
 * 端末の傾きから、背面カメラの水平な向き（時計回りの角度）を求める
 * ・スマホを立ててカメラを前に向けた持ち方でも、寝かせて画面を見る持ち方でも使えるようにする
 *   立てているときは背面カメラの向き、寝かせているときは端末の上端の向きを使う
 * ・どちらも決められないとき（ほぼ真下を向いている等）は null
 */
export function deviceHeading(alpha: number, beta: number, gamma: number): number | null {
  const ca = Math.cos(alpha * RAD)
  const sa = Math.sin(alpha * RAD)
  const cb = Math.cos(beta * RAD)
  const sb = Math.sin(beta * RAD)
  const cg = Math.cos(gamma * RAD)
  const sg = Math.sin(gamma * RAD)

  // 背面カメラの向き = 回転行列 Rz(α)・Rx(β)・Ry(γ) を (0, 0, -1) に掛けたもの（W3C の定義）
  const camX = -ca * sg - sa * sb * cg
  const camY = -sa * sg + ca * sb * cg
  const camLen = Math.hypot(camX, camY)
  // 端末の上端の向き = 同じ回転を (0, 1, 0) に掛けたもの
  const topX = -sa * cb
  const topY = ca * cb
  const topLen = Math.hypot(topX, topY)

  // 水平成分が大きい方を使う（立てて構えていればカメラ、寝かせていれば上端）
  const [x, y, len] = camLen >= topLen ? [camX, camY, camLen] : [topX, topY, topLen]
  if (len < 0.3) return null
  // y 軸（alpha=0 の向き）から x 軸の方へ時計回りの角度
  return normalizeAngle(Math.atan2(x, y) / RAD)
}

/** QRを読んだ瞬間の基準合わせ。利用者はQR（壁）を見ているので、向き = facing + 180 */
export function anchorOffset(facing: number, headingAtScan: number): number {
  return normalizeAngle(facing + 180 - headingAtScan)
}

/** 図面角度での利用者の向き */
export function planHeading(deviceHeadingNow: number, offset: number): number {
  return normalizeAngle(deviceHeadingNow + offset)
}

/** 矢印を何度回すか（画面の上＝利用者の正面。時計回りが正） */
export function arrowRotation(userPlanHeading: number, targetBearing: number): number {
  return angleDiff(userPlanHeading, targetBearing)
}

export type Confidence = 'high' | 'low' | 'none'

/**
 * 向きの信頼度（要件 F-42）
 *   high … QRを読んでから2分以内、かつ「次へ」3回以内
 *   low  … それより後（ジャイロのずれがたまっている）
 *   none … QRを読んでいない／センサーが使えない
 */
export function confidence(anchor: { at: number; stepsSince: number } | null, now: number, sensorOk: boolean): Confidence {
  if (!anchor || !sensorOk) return 'none'
  if (now - anchor.at <= 120_000 && anchor.stepsSince <= 3) return 'high'
  return 'low'
}

/** 角度の移動平均（359度と1度の平均が180度にならないよう、単位ベクトルで平均する） */
export function averageAngles(angles: number[]): number | null {
  if (angles.length === 0) return null
  let x = 0
  let y = 0
  for (const a of angles) {
    x += Math.sin(a * RAD)
    y += Math.cos(a * RAD)
  }
  if (Math.hypot(x, y) < 1e-6) return null
  return normalizeAngle(Math.atan2(x, y) / RAD)
}

/**
 * QRコードの中身からチェックポイントIDを取り出す
 * 例: "https://armap-v2.pages.dev/?cp=CP05" → "CP05"、"CP05" → "CP05"。それ以外は null
 */
export function checkpointFromQr(text: string): string | null {
  const t = text.trim()
  if (/^CP\d{2,3}$/i.test(t)) return t.toUpperCase()
  try {
    const cp = new URL(t).searchParams.get('cp')
    return cp && /^CP\d{2,3}$/i.test(cp) ? cp.toUpperCase() : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------
// 地面の印（次に目指す地点のおおよその位置に、カメラの映像の上で印を置く）
// ---------------------------------------------------------------

/** 背面カメラが水平から何度上を向いているか（下向きは負）。スマホをまっすぐ立てると 0 */
export function cameraElevation(beta: number, gamma: number): number {
  // 背面カメラの向きの上下成分 = -cos β・cos γ（deviceHeading と同じ回転行列から）
  return Math.asin(Math.max(-1, Math.min(1, -Math.cos(beta * RAD) * Math.cos(gamma * RAD)))) / RAD
}

/** 目の高さで構えたスマホのカメラの高さ（m）と、映像の長い辺（縦持ちでは縦）の画角（度）の見積もり */
const CAMERA_HEIGHT_M = 1.4
const VERTICAL_FOV_DEG = 62

/**
 * 画面の上で「カメラの正面から 1 ラジアンあたり何ピクセルか」（焦点距離・px）
 * 映像は画面いっぱいに拡大・切り取り（object-fit: cover）して出しているので、
 * 映像の長い辺の画角と、映像 → 画面の拡大率 scale から求める
 */
export function focalFromVideo(videoWidth: number, videoHeight: number, scale: number): number {
  return (Math.max(videoWidth, videoHeight) / 2 / Math.tan((VERTICAL_FOV_DEG / 2) * RAD)) * scale
}

/**
 * QRを斜めから映しているとき、その傾き（度）を、画面の上のQRの四隅から見積もる
 * 返す値 θ: 「壁に向かってまっすぐ立った向き（掲示面の向き + 180）」 = 「カメラの向き」 + θ（時計回りが正）
 *   近い側の辺は長く映る。右の辺が長い（右側が近い）＝ 壁の正面は、カメラの向きより右にある → θ > 0
 *   tanθ = (2f / QRの幅) × (右の辺 − 左の辺) / (右の辺 + 左の辺)
 * QRが小さく映っているときは誤差が大きいので null
 */
export function wallYaw(quad: [Point, Point, Point, Point], focal: number): number | null {
  const len = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y)
  const left = len(quad[0], quad[3])
  const right = len(quad[1], quad[2])
  const width = (len(quad[0], quad[1]) + len(quad[3], quad[2])) / 2
  if (width < 60) return null
  const deg = Math.atan(((2 * focal) / width) * ((right - left) / (right + left))) / RAD
  return Math.abs(deg) > 50 ? null : deg
}

/**
 * 地面の上の点が、画面のどこに見えるかを計算する（ピンホールカメラの式）
 * @param relative  利用者の正面から見た方向（度・右が正）
 * @param distance  そこまでの距離（m）
 * @param elevation カメラの上向きの角度（cameraElevation）
 * @param width,height 画面の大きさ（px）
 * @returns 画面の位置と、その距離での 1m あたりのピクセル数。カメラの後ろ・画面の外なら null
 * 機種ごとの画角や持つ高さの違いは考えないので、位置は「おおよそ」
 */
export function projectGround(
  relative: number,
  distance: number,
  elevation: number,
  width: number,
  height: number,
  focal?: number,
): { x: number; y: number; scale: number } | null {
  const f = focal ?? height / 2 / Math.tan((VERTICAL_FOV_DEG / 2) * RAD)
  const right = distance * Math.sin(relative * RAD)
  const forward = distance * Math.cos(relative * RAD)
  const e = elevation * RAD
  // 水平な座標（右・下・前）から、上へ e 傾いたカメラの座標へ
  const depth = forward * Math.cos(e) - CAMERA_HEIGHT_M * Math.sin(e)
  const down = CAMERA_HEIGHT_M * Math.cos(e) + forward * Math.sin(e)
  if (depth < 0.5) return null
  const x = width / 2 + (f * right) / depth
  const y = height / 2 + (f * down) / depth
  if (x < -40 || x > width + 40 || y < 0 || y > height) return null
  return { x, y, scale: f / depth }
}

/** これより近い目標だけ、床に輪を置く（遠い床は画面の中で地平線のすぐ下に詰まり、傾きの小さな誤差で大きくずれるため） */
export const GROUND_NEAR_M = 6

/**
 * 遠い目標の「方向の札」を、画面のどこに出すか
 * ・左右は向き（relative）だけで決める
 * ・上下は地平線の高さに置く。距離や持つ高さの見積もりを使わないので、手前・奥にずれない
 * 画面の外（後ろや真横）なら side に 'left' / 'right' を返し、画面の端に「こちら」の印を出す
 */
export function directionMarker(
  relative: number,
  elevation: number,
  width: number,
  height: number,
  focal?: number,
): { x: number; y: number; side: 'left' | 'right' | null } {
  const f = focal ?? height / 2 / Math.tan((VERTICAL_FOV_DEG / 2) * RAD)
  // 地平線: 上へ e 傾いたカメラでは、画面の中央から f・tan(e) だけ下に見える
  const horizon = height / 2 + f * Math.tan(elevation * RAD)
  const y = Math.min(height * 0.6, Math.max(height * 0.24, horizon))
  const margin = 56
  if (Math.abs(relative) < 75) {
    const x = width / 2 + f * Math.tan(relative * RAD)
    if (x >= margin && x <= width - margin) return { x, y, side: null }
  }
  return { x: relative < 0 ? margin : width - margin, y, side: relative < 0 ? 'left' : 'right' }
}

/**
 * 現地で「この向きが道の向き」を測ったときの、正しい掲示面の向き（現地調整・管理コンソール）
 * @param wallHeading  QRを読んだときの「壁にまっすぐ向いた向き」（端末の角度・カメラの向き + wallYaw の平均）
 * @param pathHeading  道（隣のノードの方）へカメラを向けたときの端末の角度
 * @param pathBearing  図面の上での、その道の向き
 * 壁にまっすぐ向いた向きと道の向きの差は、端末の角度でも図面の角度でも同じ。
 * 図面角度で: (facing + 180) + (pathHeading − wallHeading) = pathBearing → facing を求める
 */
export function calibratedFacing(wallHeading: number, pathHeading: number, pathBearing: number): number {
  return normalizeAngle(pathBearing - (pathHeading - wallHeading) - 180)
}
