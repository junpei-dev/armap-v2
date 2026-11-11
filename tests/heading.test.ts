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
