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

/** 目の高さで構えたスマホのカメラの高さ（m）と、縦持ちのときの縦の画角（度）の見積もり */
const CAMERA_HEIGHT_M = 1.4
const VERTICAL_FOV_DEG = 62

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
): { x: number; y: number; scale: number } | null {
  const f = height / 2 / Math.tan((VERTICAL_FOV_DEG / 2) * RAD)
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
