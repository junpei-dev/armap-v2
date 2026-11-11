import CampusMap from '../components/CampusMap.tsx'
import RouteLayer from '../components/RouteLayer.tsx'
import { minutesText, type Route, roundDistance, routeHighlights } from '../core/route.ts'
import type { CampusData, Room } from '../types.ts'

// ② 全体マップ（要件 F-15〜F-19）
// 学校全体の地図に、いまいる場所（◎）と目的地（●）と道順の線を出し、
// 「今からここへ行く」という全体像をつかんでもらってから案内を始める

type Props = {
  data: CampusData
  room: Room
  route: Route
  originLabel: string
  onBack: () => void
  onStart: () => void
}

export default function OverviewScreen({ data, room, route, originLabel, onBack, onStart }: Props) {
  const building = data.buildings.find((b) => b.id === room.building)
  const highlights = routeHighlights(route)

  return (
    <main className="v-screen">
      <button type="button" className="v-back" onClick={onBack}>
        ‹ 目的地を選び直す
      </button>

      <CampusMap buildings={data.buildings} highlight={[room.building]}>
        <RouteLayer route={route} animate />
      </CampusMap>
      <p className="v-legend">
        <span className="v-pin">◎</span> いまいる場所（{originLabel}）　<span className="v-goal">●</span> 目的地　<span className="v-me">▶</span> 進む向き
        {route.floorsClimbed > 0 && '　点線は2階以上'}
      </p>

      <section className="v-card">
        <h1 className="v-dest">{room.name}</h1>
        <p className="v-dest-place">
          {building?.name ?? `${room.building}棟`}・<strong>{room.floor}階</strong>
        </p>
        <p className="v-dest-meta">
          約{Math.max(5, roundDistance(route.distance))}m・徒歩{minutesText(route.seconds)}
          {route.floorsClimbed > 0 && `・階段あり`}
        </p>
        {highlights.length > 0 && (
          <ul className="v-highlights">
            {highlights.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        )}
      </section>

      <div className="v-actions">
        <button type="button" className="v-primary" onClick={onStart}>
          案内を開始する
        </button>
      </div>
    </main>
  )
}
