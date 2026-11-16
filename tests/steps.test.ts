import { describe, expect, it } from 'vitest'
import type { Step } from '../src/core/route.ts'
import { createStepDetector, pathLength, stepProgress, walkedPath } from '../src/core/steps.ts'

/** 60Hz の加速度の列を流して、数えた歩数を返す */
function count(signal: (t: number) => number, seconds: number): number {
  const feed = createStepDetector()
  let steps = 0
  for (let ms = 0; ms < seconds * 1000; ms += 1000 / 60) steps += feed(signal(ms / 1000), ms)
  return steps
}

describe('歩数計', () => {
  it('1秒に2歩の揺れを、ほぼその通りに数える', () => {
    const steps = count((t) => 9.8 + 2.5 * Math.sin(2 * Math.PI * 2 * t), 10)
    expect(steps).toBeGreaterThanOrEqual(18)
    expect(steps).toBeLessThanOrEqual(21)
  })
  it('じっとしている（小さな揺れだけ）ときは数えない', () => {
    expect(count((t) => 9.8 + 0.3 * Math.sin(2 * Math.PI * 3 * t), 10)).toBe(0)
  })
  it('1回だけの大きな揺れ（手ぶれ）は数えない', () => {
    expect(count((t) => 9.8 + (t > 3 && t < 3.15 ? 4 : 0), 8)).toBe(0)
  })
})

describe('道の上の位置', () => {
  const pts = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
  ]
  it('長さ', () => {
    expect(pathLength(pts)).toBe(20)
  })
  it('途中まで歩いた道', () => {
    expect(walkedPath(pts, 4)).toEqual([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
    ])
    expect(walkedPath(pts, 15).at(-1)).toEqual({ x: 10, y: 5 })
    expect(walkedPath(pts, 99).at(-1)).toEqual({ x: 10, y: 10 })
  })
})

describe('区間の進み具合', () => {
  const step = { distance: 30, action: { type: 'turn', dir: 'left' }, to: { landmark: undefined } } as unknown as Step
  it('遠いうちは残りの距離', () => {
    expect(stepProgress(step, 8)).toMatchObject({ near: false, text: 'あと 約20m' })
  })
  it('近づいたら「まもなく」、歩ききったら「このあたり」', () => {
    expect(stepProgress(step, 26)).toMatchObject({ near: true, text: 'まもなく 曲がり角 です' })
    expect(stepProgress(step, 40)).toMatchObject({ near: true, remaining: 0, text: 'このあたりが 曲がり角 です' })
  })
})
