import type { CampusData, Room } from '../types.ts'

// ⑥ 到着（要件 F-28）

type Props = { data: CampusData; room: Room; onBack: () => void; onFinish: () => void }

export default function ArrivedScreen({ data, room, onBack, onFinish }: Props) {
  const building = data.buildings.find((b) => b.id === room.building)
  return (
    <main className="v-screen v-arrived">
      <div className="v-arrived-mark" aria-hidden>
        ✓
      </div>
      <h1>到着しました</h1>
      <p className="v-dest">{room.name}</p>
      <p className="v-dest-place">
        {building?.name ?? `${room.building}棟`}・{room.floor}階
      </p>
      {room.description && <p className="v-arrived-desc">{room.description}</p>}
      <p className="v-note">見つからないときは「案内に戻る」で、ひとつ前の案内を確かめてください。</p>
      <div className="v-actions v-actions-2">
        <button type="button" className="v-secondary" onClick={onBack}>
          案内に戻る
        </button>
        <button type="button" className="v-primary" onClick={onFinish}>
          別の場所へ
        </button>
      </div>
    </main>
  )
}
