import { describe, expect, it } from 'vitest'
import {
  anchorOffset,
  arrowRotation,
  averageAngles,
  checkpointFromQr,
  confidence,
  deviceHeading,
  planHeading,
} from '../src/core/heading.ts'

describe('deviceHeading（背面カメラの向き）', () => {
  it('立てて構える（beta=90）: alpha=0 なら 0度', () => {
    expect(deviceHeading(0, 90, 0)).toBeCloseTo(0)
  })
  it('左へ90度回す（alpha=90）と、時計回りの角度では270度', () => {
    expect(deviceHeading(90, 90, 0)).toBeCloseTo(270)
  })
  it('右へ90度回す（alpha=270）と90度', () => {
    expect(deviceHeading(270, 90, 0)).toBeCloseTo(90)
  })
  it('少し前に傾けて持っても（beta=60）向きは変わらない', () => {
    expect(deviceHeading(30, 60, 0)).toBeCloseTo(330)
  })
  it('机に寝かせた（beta=0）ときは、端末の上端の向きを使う', () => {
    expect(deviceHeading(0, 0, 0)).toBeCloseTo(0)
    expect(deviceHeading(90, 0, 0)).toBeCloseTo(270)
  })
})

describe('QRでの基準合わせと矢印', () => {
  it('東向きの壁（facing=90）のQRを読んだとき、利用者は西（270度）を向いている', () => {
    const offset = anchorOffset(90, 123) // 端末の角度が何度でも
    expect(planHeading(123, offset)).toBeCloseTo(270)
    // そこから体を右へ90度回すと、北（0度）
    expect(planHeading(123 + 90, offset)).toBeCloseTo(0)
  })
  it('進む方向が右なら矢印は右へ、真後ろなら180度', () => {
    expect(arrowRotation(0, 90)).toBe(90)
    expect(arrowRotation(0, 270)).toBe(-90)
    expect(Math.abs(arrowRotation(0, 180))).toBe(180)
  })
})

describe('信頼度', () => {
  it('QRを読んでいなければ none', () => {
    expect(confidence(null, 0, true)).toBe('none')
  })
  it('2分以内・3区間以内なら high、過ぎたら low', () => {
    expect(confidence({ at: 0, stepsSince: 1 }, 60_000, true)).toBe('high')
    expect(confidence({ at: 0, stepsSince: 4 }, 60_000, true)).toBe('low')
    expect(confidence({ at: 0, stepsSince: 0 }, 200_000, true)).toBe('low')
  })
  it('センサーが使えなければ none', () => {
    expect(confidence({ at: 0, stepsSince: 0 }, 0, false)).toBe('none')
  })
})

describe('その他', () => {
  it('averageAngles は 359度と1度の平均を0度にする', () => {
    expect(averageAngles([359, 1])).toBeCloseTo(0)
    expect(averageAngles([80, 100])).toBeCloseTo(90)
  })
  it('checkpointFromQr', () => {
    expect(checkpointFromQr('https://armap-v2.pages.dev/?cp=cp05')).toBe('CP05')
    expect(checkpointFromQr('CP01')).toBe('CP01')
    expect(checkpointFromQr('https://example.com/')).toBeNull()
    expect(checkpointFromQr('こんにちは')).toBeNull()
  })
})

describe('地面の印', () => {
  it('スマホをまっすぐ立てると、カメラは水平', async () => {
    const { cameraElevation } = await import('../src/core/heading.ts')
    expect(cameraElevation(90, 0)).toBeCloseTo(0)
    expect(cameraElevation(60, 0)).toBeCloseTo(-30) // 手前に倒すと下向き
  })
  it('正面の地面の点は画面の中央の下、遠いほど中央（地平線）に近づく', async () => {
    const { projectGround } = await import('../src/core/heading.ts')
    const near = projectGround(0, 3, 0, 400, 800)!
    const far = projectGround(0, 20, 0, 400, 800)!
    expect(near.x).toBeCloseTo(200)
    expect(near.y).toBeGreaterThan(far.y)
    expect(far.y).toBeGreaterThan(400)
    expect(far.scale).toBeLessThan(near.scale)
  })
  it('右にある点は画面の右、後ろにある点は出さない', async () => {
    const { projectGround } = await import('../src/core/heading.ts')
    expect(projectGround(15, 10, 0, 400, 800)!.x).toBeGreaterThan(200)
    expect(projectGround(170, 10, 0, 400, 800)).toBeNull()
  })
})

describe('QRを斜めから映したときの傾き', () => {
  /** カメラの正面 +Z・右 +X・下 +Y。壁の正面（壁へ向かう向き）をカメラの向きから theta 度右に回して、QRの四隅を写す */
  function project(theta: number, offsetX = 0) {
    const t = (theta * Math.PI) / 180
    const f = 800
    const n = { x: Math.sin(t), z: Math.cos(t) } // 壁へ向かう向き
    const u = { x: Math.cos(t), z: -Math.sin(t) } // 壁に沿って右
    const c = { x: offsetX, y: 0, z: 1.2 }
    void n
    const s = 0.2
    const pt = (du: number, dv: number) => {
      const X = c.x + u.x * du
      const Y = c.y + dv
      const Z = c.z + u.z * du
      return { x: 400 + (f * X) / Z, y: 800 + (f * Y) / Z }
    }
    return { f, quad: [pt(-s / 2, -s / 2), pt(s / 2, -s / 2), pt(s / 2, s / 2), pt(-s / 2, s / 2)] as const }
  }
  it('正面から映すと 0 度', async () => {
    const { wallYaw } = await import('../src/core/heading.ts')
    const { f, quad } = project(0)
    expect(wallYaw([...quad], f)).toBeCloseTo(0, 1)
  })
  it('20度・-25度の傾きを、2度以内で見積もる', async () => {
    const { wallYaw } = await import('../src/core/heading.ts')
    for (const theta of [20, -25]) {
      const { f, quad } = project(theta, 0.15)
      expect(Math.abs(wallYaw([...quad], f)! - theta)).toBeLessThan(2)
    }
  })
})

describe('方向の札と現地調整', () => {
  it('正面の札は画面の中央、右の目標は右、真横より後ろは画面の端', async () => {
    const { directionMarker } = await import('../src/core/heading.ts')
    expect(directionMarker(0, 0, 400, 800).x).toBeCloseTo(200)
    expect(directionMarker(10, 0, 400, 800).x).toBeGreaterThan(200)
    expect(directionMarker(120, 0, 400, 800).side).toBe('right')
    expect(directionMarker(-40, 0, 400, 800).side).toBe('left') // 縦持ちの画面は横が狭い
  })
  it('掲示面の向きの計算: 壁にまっすぐ向いて 30度、道へ向けて 120度、道の図面角度が 0度 → 掲示面は 90度', async () => {
    const { calibratedFacing } = await import('../src/core/heading.ts')
    // 壁へ向かう向き(図面) = 道の向き − 90 = 270 → 掲示面 = 90
    expect(calibratedFacing(30, 120, 0)).toBeCloseTo(90)
  })
})
