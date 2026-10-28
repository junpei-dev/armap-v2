import { describe, expect, it } from 'vitest'
import {
  angleDiff,
  distance,
  globalToLocal,
  localToGlobal,
  normalizeAngle,
  planAngle,
} from '../src/core/geometry.ts'
import type { BuildingPlacement } from '../src/types.ts'

describe('planAngle（図面角度: 上0度・時計回り）', () => {
  const o = { x: 10, y: 10 }
  it('上は0度', () => expect(planAngle(o, { x: 10, y: 0 })).toBeCloseTo(0))
  it('右は90度', () => expect(planAngle(o, { x: 20, y: 10 })).toBeCloseTo(90))
  it('下は180度', () => expect(planAngle(o, { x: 10, y: 20 })).toBeCloseTo(180))
  it('左は270度', () => expect(planAngle(o, { x: 0, y: 10 })).toBeCloseTo(270))
  it('右上は45度', () => expect(planAngle(o, { x: 20, y: 0 })).toBeCloseTo(45))
})

describe('角度の補助', () => {
  it('normalizeAngle', () => {
    expect(normalizeAngle(-90)).toBe(270)
    expect(normalizeAngle(450)).toBe(90)
  })
  it('angleDiff: 0度→90度は右へ90度', () => expect(angleDiff(0, 90)).toBe(90))
  it('angleDiff: 0度→270度は左へ90度', () => expect(angleDiff(0, 270)).toBe(-90))
  it('angleDiff: 350度→10度は右へ20度', () => expect(angleDiff(350, 10)).toBe(20))
  it('distance', () => expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5))
})

describe('ローカル座標 ⇔ 全体座標', () => {
  const origin = { x: 100, y: 50 }
  const p = { u: 8.35, v: 36.1 } // ① 1階 事務室の前（設計書 5.3）

  it('rotation 0: そのまま平行移動', () => {
    expect(localToGlobal(p, { origin, rotation: 0 })).toEqual({ x: 108.35, y: 86.1 })
  })
  it('rotation 90: 平面図の右(u)が配置図の下になる', () => {
    const g = localToGlobal({ u: 1, v: 0 }, { origin, rotation: 90 })
    expect(g).toEqual({ x: 100, y: 51 })
  })
  it('rotation 270: 平面図の下(v)が配置図の右になる', () => {
    const g = localToGlobal({ u: 0, v: 1 }, { origin, rotation: 270 })
    expect(g).toEqual({ x: 101, y: 50 })
  })

  for (const rotation of [0, 90, 180, 270] as const) {
    it(`rotation ${rotation}: 変換して戻すと元に戻る`, () => {
      const placement: BuildingPlacement = { origin, rotation }
      const back = globalToLocal(localToGlobal(p, placement), placement)
      expect(back.u).toBeCloseTo(p.u)
      expect(back.v).toBeCloseTo(p.v)
    })
  }
})
