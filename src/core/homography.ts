import type { Point } from '../types.ts'

// 射影変換（ホモグラフィ・設計書 8.2）
// 正方形（QRコード）が、カメラの映像では傾いた四角形に見える。
// その対応から 3×3 の行列 H を求めると、正方形の上の好きな点が映像のどこに見えるかを計算できる。
// これを CSS の matrix3d にして矢印の要素に掛けると、矢印が QR の貼られた壁の上に描かれる。

/** 3×3 行列（行の順に9個） */
export type Matrix3 = [number, number, number, number, number, number, number, number, number]

/**
 * 単位正方形 (0,0) (1,0) (1,1) (0,1) を、四角形 q0 q1 q2 q3（同じ順＝左上・右上・右下・左下）に移す行列
 * （Heckbert の方法。4点から8つの係数を直接求める）
 */
export function squareToQuad(q0: Point, q1: Point, q2: Point, q3: Point): Matrix3 {
  const dx1 = q1.x - q2.x
  const dx2 = q3.x - q2.x
  const dy1 = q1.y - q2.y
  const dy2 = q3.y - q2.y
  const sx = q0.x - q1.x + q2.x - q3.x
  const sy = q0.y - q1.y + q2.y - q3.y
  const det = dx1 * dy2 - dx2 * dy1
  const g = (sx * dy2 - dx2 * sy) / det
  const h = (dx1 * sy - sx * dy1) / det
  return [
    q1.x - q0.x + g * q1.x,
    q3.x - q0.x + h * q3.x,
    q0.x,
    q1.y - q0.y + g * q1.y,
    q3.y - q0.y + h * q3.y,
    q0.y,
    g,
    h,
    1,
  ]
}

/** 行列 H で点 (u, v) を移す */
export function applyHomography(m: Matrix3, u: number, v: number): Point {
  const w = m[6] * u + m[7] * v + m[8]
  return { x: (m[0] * u + m[1] * v + m[2]) / w, y: (m[3] * u + m[4] * v + m[5]) / w }
}

/**
 * 大きさ size×size の要素（左上が原点・transform-origin: 0 0）を、
 * 単位正方形の範囲 [from, to]×[from, to] として、QRの四角形に合わせて変形する CSS の matrix3d
 * 例: from=-1, to=2 なら、QRの周りに QR 1個分の余白を足した範囲（矢印をQRからはみ出して描ける）
 */
export function cssMatrix3d(qr: [Point, Point, Point, Point], size: number, from = 0, to = 1): string {
  const H = squareToQuad(...qr)
  // 要素の四隅が、QRの座標でどこにあたるかを映像の座標に移す
  const c = [
    applyHomography(H, from, from),
    applyHomography(H, to, from),
    applyHomography(H, to, to),
    applyHomography(H, from, to),
  ] as const
  const m = squareToQuad(c[0], c[1], c[2], c[3])
  // 要素の座標（0〜size）を 0〜1 に縮めてから m を掛ける。CSS は列の順に並べる
  const a = [m[0] / size, m[1] / size, m[2], m[3] / size, m[4] / size, m[5], m[6] / size, m[7] / size, m[8]]
  return `matrix3d(${[a[0], a[3], 0, a[6], a[1], a[4], 0, a[7], 0, 0, 1, 0, a[2], a[5], 0, a[8]].map((v) => +v.toFixed(8)).join(',')})`
}
