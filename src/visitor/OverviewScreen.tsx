import CampusMap from '../components/CampusMap.tsx'
import Icon from '../components/Icon.tsx'
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
      <div className="v-topbar">
        <button type="button" className="v-back" onClick={onBack}>
          <Icon name="back" size={18} />
          目的地を選び直す
        </button>
      </div>

      <CampusMap buildings={data.buildings} highlight={[room.building]}>
        <RouteLayer route={route} animate />
      </CampusMap>
      <p className="v-legend">
        <span>
          <b className="v-pin">◎</b> いまいる場所（{originLabel}）
        </span>
        <span>
          <b className="v-goal">●</b> 目的地
        </span>
        <span>
          <b className="v-me">▶</b> 進む向き
        </span>
        {route.floorsClimbed > 0 && <span>点線は2階以上</span>}
      </p>

      <section className="v-card">
        <div className="v-label">目的地</div>
        <h1 className="v-dest">{room.name}</h1>
        <p className="v-dest-place">
          {building?.name ?? `${room.building}棟`}・<strong>{room.floor}階</strong>
        </p>
        <p className="v-dest-meta">
          <span className="v-pill">
            <Icon name="walk" size={16} />約{Math.max(5, roundDistance(route.distance))}m・徒歩{minutesText(route.seconds)}
          </span>
          {route.floorsClimbed > 0 && (
            <span className="v-pill v-pill-stairs">
              <Icon name="stairs" size={16} />
              階段あり
            </span>
          )}
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
