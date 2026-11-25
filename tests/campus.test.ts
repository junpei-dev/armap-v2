import { describe, expect, it } from 'vitest'

describe('QRのある場所を目的地にする', () => {
  it('事務室は「事務室（受付）」、部屋の無いQRは目印の名前、部屋のあるQRは作らない', async () => {
    const { withCheckpointRooms, roomPlace, CP_ROOM_PREFIX } = await import('../src/core/campus.ts')
    const raw = {
      nodes: [
        { id: 'J', building: '1', floor: 1, kind: 'door' as const, landmark: '事務室の窓口' },
        { id: 'S', building: '43', floor: 3, kind: 'door' as const, landmark: '生徒指導部' },
        { id: 'G', floor: 1, kind: 'outdoor' as const, landmark: '体育館' },
        { id: 'K', building: '1', floor: 1, kind: 'door' as const },
      ],
      checkpoints: [
        { id: 'CP01', node: 'J', facing: 0, place: '事務室窓口の横の壁' },
        { id: 'CP02', node: 'S', facing: 0, place: '生徒指導部の前' },
        { id: 'CP03', node: 'G', facing: 0, place: '体育館の前' },
        { id: 'CP04', node: 'K', facing: 0, place: '進路指導部の前' },
      ],
      rooms: [{ id: 'R1', name: '進路指導室', drawingName: '', aliases: [], building: '1', floor: 1, node: 'K', category: 'admin' as const, visible: true }],
    }
    const out = withCheckpointRooms(raw)
    const extra = out.rooms.filter((r) => r.id.startsWith(CP_ROOM_PREFIX))
    expect(extra.map((r) => r.name)).toEqual(['事務室（受付）', '生徒指導部', '体育館'])
    expect(roomPlace(extra[2], [])).toBe('屋外')
    expect(roomPlace(extra[1], [{ id: '43', name: '普通教室棟' }])).toBe('普通教室棟・3階')
    expect(raw.rooms).toHaveLength(1) // 元のデータは変えない
  })
})
