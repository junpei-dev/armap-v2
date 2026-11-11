import { describe, expect, it } from 'vitest'
import { buildSteps, findPath, planRoute, roundDistance, stepText, turnDirection } from '../src/core/route.ts'
import type { Edge, PlacedNode } from '../src/types.ts'

// ① 管理・教室棟を、平面図の寸法どおりに置いたテスト用データ（基準点 (0,0)・向き 0 なので pos = u,v）
// 廊下の中心 u=8.35。階段 27.60〜31.60、事務室 31.60〜40.60、校長室 40.60〜49.60、職員室 49.60〜67.60
const N = (id: string, floor: number, kind: PlacedNode['kind'], x: number, y: number, landmark?: string): PlacedNode => ({
  id,
  building: '1',
  floor,
  kind,
  pos: { x, y },
  ...(landmark ? { landmark } : {}),
})

const nodes: PlacedNode[] = [
  N('B1-1F-D-jimu', 1, 'door', 8.35, 36.1, '事務室の窓口'),
  N('B1-1F-C-kocho', 1, 'corridor', 8.35, 45.1, '校長室の前'),
  N('B1-1F-D-shokuin', 1, 'door', 8.35, 58.6, '職員室の入口'),
  N('B1-1F-S1', 1, 'stairs', 8.35, 29.6, 'ホール横の階段'),
  N('B1-2F-S1', 2, 'stairs', 8.35, 29.6, 'ホール横の階段'),
  N('B1-2F-C01', 2, 'corridor', 8.35, 20),
  N('B1-2F-D-kaigi', 2, 'door', 8.35, 4.7, '会議室の入口'),
]

const E = (from: string, to: string, kind: Edge['kind'] = 'walk'): Edge => ({ from, to, kind, oneway: false, closed: false })
const edges: Edge[] = [
  E('B1-1F-D-jimu', 'B1-1F-C-kocho'),
  E('B1-1F-C-kocho', 'B1-1F-D-shokuin'),
  E('B1-1F-D-jimu', 'B1-1F-S1'),
  E('B1-1F-S1', 'B1-2F-S1', 'stairs'),
  E('B1-2F-S1', 'B1-2F-C01'),
  E('B1-2F-C01', 'B1-2F-D-kaigi'),
]
const config = { walkSpeed: 1, stairSeconds: 15 }

describe('findPath（ダイクストラ法）', () => {
  it('事務室 → 職員室', () => {
    expect(findPath(nodes, edges, 'B1-1F-D-jimu', 'B1-1F-D-shokuin')).toEqual([
      'B1-1F-D-jimu',
      'B1-1F-C-kocho',
      'B1-1F-D-shokuin',
    ])
  })

  it('事務室 → 会議室（2階）は階段を通る', () => {
    expect(findPath(nodes, edges, 'B1-1F-D-jimu', 'B1-2F-D-kaigi')).toEqual([
      'B1-1F-D-jimu',
      'B1-1F-S1',
      'B1-2F-S1',
      'B1-2F-C01',
      'B1-2F-D-kaigi',
    ])
  })

  it('つながっていなければ null', () => {
    expect(findPath(nodes, edges.slice(0, 2), 'B1-1F-D-jimu', 'B1-2F-D-kaigi')).toBeNull()
  })

  it('通行止めの辺は通らず、回り道を選ぶ', () => {
    const square: PlacedNode[] = [
      N('A', 1, 'corridor', 0, 0),
      N('B', 1, 'corridor', 10, 0),
      N('C', 1, 'corridor', 0, 30),
      N('D', 1, 'corridor', 10, 30),
    ]
    const es = [E('A', 'B'), E('A', 'C'), E('C', 'D'), E('B', 'D')]
    expect(findPath(square, es, 'A', 'B')).toEqual(['A', 'B'])
    es[0].closed = true
    expect(findPath(square, es, 'A', 'B')).toEqual(['A', 'C', 'D', 'B'])
  })

  it('一方通行は逆向きに通れない', () => {
    const es = [{ ...E('B1-1F-D-jimu', 'B1-1F-C-kocho'), oneway: true }, E('B1-1F-C-kocho', 'B1-1F-D-shokuin')]
    expect(findPath(nodes, es, 'B1-1F-D-shokuin', 'B1-1F-D-jimu')).toBeNull()
  })

  it('階段は1階あたり10mの遠回りとみなす（少し遠くても同じ階の道を選ぶ）', () => {
    const ns: PlacedNode[] = [
      N('A', 1, 'corridor', 0, 0),
      N('B', 1, 'corridor', 0, 25),
      N('S1', 1, 'stairs', 0, 1),
      N('S2', 2, 'stairs', 0, 1),
      N('T2', 2, 'stairs', 0, 24),
      N('T1', 1, 'stairs', 0, 24),
    ]
    // 1階の廊下は25m。2階を通ると 1+23+1=25m だが、階段2回分（20m）が加わるので1階を選ぶ
    const es = [E('A', 'B'), E('A', 'S1'), E('S1', 'S2', 'stairs'), E('S2', 'T2'), E('T2', 'T1', 'stairs'), E('T1', 'B')]
    expect(findPath(ns, es, 'A', 'B')).toEqual(['A', 'B'])
  })
})

describe('曲がる方向・距離の丸め', () => {
  it('turnDirection', () => {
    expect(turnDirection(0, 10)).toBe('straight')
    expect(turnDirection(0, 90)).toBe('right')
    expect(turnDirection(0, 270)).toBe('left')
    expect(turnDirection(0, 180)).toBe('back')
    expect(turnDirection(350, 80)).toBe('right')
  })
  it('roundDistance は5m単位', () => {
    expect(roundDistance(1)).toBe(0)
    expect(roundDistance(3)).toBe(5)
    expect(roundDistance(12)).toBe(10)
    expect(roundDistance(22.5)).toBe(25)
  })
})

describe('buildSteps（区間と案内文）', () => {
  it('事務室 → 職員室: まっすぐなので1区間', () => {
    const route = planRoute(nodes, edges, [], config, 'B1-1F-D-jimu', 'B1-1F-D-shokuin', '職員室')!
    expect(route.steps).toHaveLength(1)
    expect(route.steps[0].text).toBe('約25m 進むと、職員室に着きます')
    expect(route.distance).toBeCloseTo(22.5)
  })

  it('事務室 → 会議室: 階段で2階へ上り、そのまま進む', () => {
    const route = planRoute(nodes, edges, [], config, 'B1-1F-D-jimu', 'B1-2F-D-kaigi', '会議室')!
    expect(route.steps.map((s) => s.text)).toEqual([
      'ホール横の階段まで 約5m 進み、階段で2階へ上ります',
      '約25m 進むと、会議室に着きます',
    ])
    expect(route.floorsClimbed).toBe(1)
    // 6.5m + 24.9m を 1m/秒 ＋ 階段15秒
    expect(route.seconds).toBeCloseTo(6.5 + 24.9 + 15)
  })

  it('曲がり角で区切り、右・左を判定する', () => {
    // 上（北）へ10m進んでから右（東）へ / 左（西）へ
    const ns = [N('A', 1, 'corridor', 0, 0), N('B', 1, 'corridor', 0, -10, '掲示板'), N('C', 1, 'door', 10, -10), N('D', 1, 'door', -10, -10)]
    const right = buildSteps([ns[0], ns[1], ns[2]])
    expect(right.map((s) => s.text)).toEqual(['掲示板まで 約10m 進み、右へ曲がります', '約10m 進むと、部屋の入口に着きます'])
    const left = buildSteps([ns[0], ns[1], ns[3]])
    expect(left[0].action).toEqual({ type: 'turn', dir: 'left' })
  })

  it('ほぼまっすぐな途中のノードでは区切らない', () => {
    const ns = [N('A', 1, 'corridor', 0, 0), N('B', 1, 'corridor', 1, -10), N('C', 1, 'corridor', 0, -20)]
    expect(buildSteps(ns)).toHaveLength(1)
  })

  it('棟の出入口とQRチェックポイントで区切る', () => {
    const ns = [
      N('A', 1, 'corridor', 0, 0),
      N('E', 1, 'entrance', 0, -10, '北側の出入口'),
      N('Q', 1, 'outdoor', 0, -20, '自販機の前'),
      N('G', 1, 'door', 0, -30),
    ]
    const steps = buildSteps(ns, [{ id: 'CP05', node: 'Q', facing: 0, place: '' }])
    expect(steps.map((s) => s.to.id)).toEqual(['E', 'Q', 'G'])
    expect(steps[0].text).toBe('北側の出入口まで 約10m 進み、そのまま進みます')
    expect(steps[1].checkpoint).toBe('CP05')
  })

  it('1階から3階まで続けて上る階段は1つの動作にまとめる', () => {
    const ns = [
      N('A', 1, 'corridor', 0, 0),
      N('S1', 1, 'stairs', 0, -5),
      N('S2', 2, 'stairs', 0, -5),
      N('S3', 3, 'stairs', 0, -5),
      N('G', 3, 'door', 0, -15),
    ]
    const steps = buildSteps(ns, [], '製図室')
    expect(steps.map((s) => s.text)).toEqual(['階段まで 約5m 進み、階段で3階へ上ります', '約10m 進むと、製図室に着きます'])
  })

  it('出発点が階段なら、最初の区間は階段の動作だけ', () => {
    const ns = [N('S1', 1, 'stairs', 0, 0), N('S2', 2, 'stairs', 0, 0), N('G', 2, 'door', 0, -10)]
    const steps = buildSteps(ns)
    expect(steps[0].text).toBe('階段で2階へ上ります')
    expect(steps[0].action).toEqual({ type: 'stairs', toFloor: 2, up: true })
    expect(steps).toHaveLength(2)
  })

  it('出発点と目的地が同じ', () => {
    const steps = buildSteps([nodes[0]], [], '事務室')
    expect(steps[0].text).toBe('ここが事務室です')
  })

  it('stepText: 近い所（2.5m未満）は距離を言わない', () => {
    const to = N('X', 1, 'corridor', 0, 0, '掲示板')
    expect(stepText({ to, distance: 1, action: { type: 'turn', dir: 'left' } })).toBe('掲示板で、左へ曲がります')
  })
})

describe('routeHighlights（全体マップの下の要点）', () => {
  it('階段と出入口を拾う', async () => {
    const { routeHighlights } = await import('../src/core/route.ts')
    const route = planRoute(nodes, edges, [], config, 'B1-1F-D-jimu', 'B1-2F-D-kaigi', '会議室')!
    expect(routeHighlights(route)).toEqual(['ホール横の階段で2階へ'])
  })
})
