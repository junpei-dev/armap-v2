import { describe, expect, it } from 'vitest'
import { applyHomography, cssMatrix3d, squareToQuad } from '../src/core/homography.ts'

// 斜めから見たQR（台形）
const quad = [
  { x: 100, y: 100 },
  { x: 300, y: 120 },
  { x: 290, y: 300 },
  { x: 110, y: 280 },
] as [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }]

describe('射影変換', () => {
  it('正方形の四隅が、四角形の四隅に移る', () => {
    const H = squareToQuad(...quad)
    const corners = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]
    corners.forEach(([u, v], i) => {
      const p = applyHomography(H, u, v)
      expect(p.x).toBeCloseTo(quad[i].x)
      expect(p.y).toBeCloseTo(quad[i].y)
    })
  })

  it('CSS の matrix3d も、要素の四隅を同じ位置に移す', () => {
    const size = 300
    const css = cssMatrix3d(quad, size)
    const v = css.slice('matrix3d('.length, -1).split(',').map(Number)
    // CSS の行列（列の順）で、要素の点 (x, y, 0, 1) を移す
    const move = (x: number, y: number) => {
      const X = v[0] * x + v[4] * y + v[12]
      const Y = v[1] * x + v[5] * y + v[13]
      const W = v[3] * x + v[7] * y + v[15]
      return { x: X / W, y: Y / W }
    }
    const p = move(size, size)
    expect(p.x).toBeCloseTo(quad[2].x, 3)
    expect(p.y).toBeCloseTo(quad[2].y, 3)
    const q = move(0, size)
    expect(q.x).toBeCloseTo(quad[3].x, 3)
  })
})
