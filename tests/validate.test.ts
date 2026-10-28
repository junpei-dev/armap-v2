import { describe, expect, it } from 'vitest'
import { inputFromTap, nodePosition, reachableFrom, suggestNodeId } from '../src/core/campus.ts'
import { newFatalIssues, validate } from '../src/core/validate.ts'
import type { Building, CampusRaw } from '../src/types.ts'

// ① 管理棟を簡略化したデータ（基準点 (100, 50)、向き 0）
const kanri: Building = {
  id: '1',
  name: '管理・教室棟',
  drawingName: '管理，教室棟',
  floors: 3,
  outline: [
    { x: 100, y: 50 },
    { x: 112.6, y: 50 },
    { x: 112.6, y: 117.6 },
    { x: 100, y: 117.6 },
  ],
  origin: { x: 100, y: 50 },
  rotation: 0,
}

function sample(): CampusRaw {
  return {
    version: 1,
    config: { mapNorthBearing: null, walkSpeed: 1, stairSeconds: 15 },
    buildings: [kanri],
    nodes: [
      { id: 'B1-1F-D-jimu', building: '1', floor: 1, kind: 'door', local: { u: 8.35, v: 36.1 } },
      { id: 'B1-1F-D-shokuin', building: '1', floor: 1, kind: 'door', local: { u: 8.35, v: 58.6 } },
      { id: 'B1-1F-S1', building: '1', floor: 1, kind: 'stairs', local: { u: 8.35, v: 29.6 } },
      { id: 'B1-2F-S1', building: '1', floor: 2, kind: 'stairs', local: { u: 8.35, v: 29.6 } },
    ],
    edges: [
      { from: 'B1-1F-D-jimu', to: 'B1-1F-D-shokuin', kind: 'walk', oneway: false, closed: false },
      { from: 'B1-1F-D-jimu', to: 'B1-1F-S1', kind: 'walk', oneway: false, closed: false },
      { from: 'B1-1F-S1', to: 'B1-2F-S1', kind: 'stairs', oneway: false, closed: false },
    ],
    rooms: [
      {
        id: 'R-1-1F-shokuin',
        name: '職員室',
        drawingName: '職員室',
        aliases: [],
        building: '1',
        floor: 1,
        node: 'B1-1F-D-shokuin',
        category: 'admin',
        visible: true,
      },
    ],
    checkpoints: [{ id: 'CP01', node: 'B1-1F-D-jimu', facing: 270, place: '事務室窓口' }],
  }
}

describe('validate', () => {
  it('正しいデータには問題がない', () => {
    expect(validate(sample())).toEqual([])
  })

  it('存在しないノードを指す辺は致命的', () => {
    const raw = sample()
    raw.edges.push({ from: 'B1-1F-D-jimu', to: 'NOPE', kind: 'walk', oneway: false, closed: false })
    expect(validate(raw).some((i) => i.level === 'fatal' && i.message.includes('NOPE'))).toBe(true)
  })

  it('参照されているノードを消すと致命的になる', () => {
    const raw = sample()
    raw.nodes = raw.nodes.filter((n) => n.id !== 'B1-1F-D-shokuin')
    const fatal = validate(raw).filter((i) => i.level === 'fatal')
    expect(fatal.length).toBeGreaterThan(0)
  })

  it('棟の階数を超える階は致命的', () => {
    const raw = sample()
    raw.nodes.push({ id: 'B1-5F-C01', building: '1', floor: 5, kind: 'corridor', local: { u: 1, v: 1 } })
    expect(validate(raw).some((i) => i.level === 'fatal' && i.target === 'ノード B1-5F-C01')).toBe(true)
  })

  it('平面図の置き方が未設定の棟に u・v を使うと致命的', () => {
    const raw = sample()
    raw.buildings.push({ ...kanri, id: '28', origin: undefined, rotation: undefined })
    raw.nodes.push({ id: 'B28-1F-C01', building: '28', floor: 1, kind: 'corridor', local: { u: 1, v: 1 } })
    expect(validate(raw).some((i) => i.level === 'fatal' && i.target === 'ノード B28-1F-C01')).toBe(true)
  })

  it('事務室からつながらない部屋は注意（保存はできる）', () => {
    const raw = sample()
    raw.edges = raw.edges.filter((e) => e.to !== 'B1-1F-D-shokuin')
    const issues = validate(raw)
    expect(issues.every((i) => i.level === 'warning')).toBe(true)
    expect(issues.some((i) => i.message.includes('来校者の一覧に出ません'))).toBe(true)
  })

  it('CP01 が無ければ注意を出す', () => {
    const raw = sample()
    raw.checkpoints = []
    expect(validate(raw).some((i) => i.message.includes('CP01'))).toBe(true)
  })

  it('階段の辺の両端が2階以上離れていれば注意', () => {
    const raw = sample()
    raw.nodes.push({ id: 'B1-3F-S1', building: '1', floor: 3, kind: 'stairs', local: { u: 8.35, v: 29.6 } })
    raw.edges.push({ from: 'B1-1F-S1', to: 'B1-3F-S1', kind: 'stairs', oneway: false, closed: false })
    expect(validate(raw).some((i) => i.message.includes('階が1つ違う'))).toBe(true)
  })

  it('棟の外形の外にある屋内ノードは注意', () => {
    const raw = sample()
    raw.nodes.push({ id: 'B1-1F-C09', building: '1', floor: 1, kind: 'corridor', local: { u: 30, v: 1 } })
    raw.edges.push({ from: 'B1-1F-S1', to: 'B1-1F-C09', kind: 'walk', oneway: false, closed: false })
    expect(validate(raw).some((i) => i.target === 'ノード B1-1F-C09' && i.message.includes('外形の外'))).toBe(true)
  })

  it('newFatalIssues は、もともとあった致命的な問題を除く', () => {
    const before = [{ level: 'fatal' as const, target: 'A', message: 'x' }]
    const after = [...before, { level: 'fatal' as const, target: 'B', message: 'y' }]
    expect(newFatalIssues(before, after)).toEqual([{ level: 'fatal', target: 'B', message: 'y' }])
  })
})

describe('campus の関数', () => {
  it('ローカル座標のノードは棟の基準点から位置を計算する', () => {
    const pos = nodePosition(sample().nodes[0], new Map([['1', kanri]]))
    expect(pos?.x).toBeCloseTo(108.35)
    expect(pos?.y).toBeCloseTo(86.1)
  })

  it('地図をタップした位置は、置き方が分かる棟なら u・v にする', () => {
    expect(inputFromTap({ x: 108.35, y: 86.1 }, kanri)).toEqual({ local: { u: 8.35, v: 36.1 } })
    expect(inputFromTap({ x: 5, y: 6 }, undefined)).toEqual({ pos: { x: 5, y: 6 } })
  })

  it('閉じた辺・一方通行を考えて、たどれるノードを求める', () => {
    const edges = sample().edges
    expect(reachableFrom('B1-1F-D-jimu', edges).has('B1-2F-S1')).toBe(true)
    edges[1].closed = true
    expect(reachableFrom('B1-1F-D-jimu', edges).has('B1-2F-S1')).toBe(false)
  })

  it('ノードIDの提案は空いている番号を使う', () => {
    expect(suggestNodeId(new Set(['B1-1F-C01']), '1', 1, 'C')).toBe('B1-1F-C02')
    expect(suggestNodeId(new Set(), undefined, 1, 'O')).toBe('OUT-1')
  })
})
