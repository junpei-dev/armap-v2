import { useMemo, useState } from 'react'
import CampusMap from '../components/CampusMap.tsx'
import RouteLayer from '../components/RouteLayer.tsx'
import { placeNodes } from '../core/campus.ts'
import { planRoute, roundDistance } from '../core/route.ts'
import { useAdmin } from './AdminContext.tsx'

// 経路の確認（要件 F-56）
// 出発点と目的地を選ぶと、来校者向けと同じ計算で道順と案内文を出す。
// 「案内文が不自然」「遠回りしている」をここで見つけて、ノードや目印を直す

export default function RoutePreview() {
  const { data } = useAdmin()
  const [start, setStart] = useState(data.startNode ?? '')
  const [roomId, setRoomId] = useState(data.rooms[0]?.id ?? '')
  const [active, setActive] = useState<number | undefined>(undefined)

  const placed = useMemo(() => placeNodes(data), [data])
  const room = data.rooms.find((r) => r.id === roomId)
  const route = useMemo(
    () => (start && room ? planRoute(placed, data.edges, data.checkpoints, data.config, start, room.node, room.name) : null),
    [placed, data.edges, data.checkpoints, data.config, start, room],
  )
  const goalBuilding = room?.building

  // 出発点の候補: チェックポイント（QRの地点）を先に、そのあと全ノード
  const cpNodes = new Set(data.checkpoints.map((c) => c.node))

  return (
    <div className="split">
      <div>
        <div className="toolbar">
          <label>
            出発点{' '}
            <select value={start} onChange={(e) => setStart(e.target.value)}>
              <option value="">（選んでください）</option>
              <optgroup label="チェックポイント（QR）">
                {data.checkpoints.map((c) => (
                  <option key={c.id} value={c.node}>
                    {c.id} {c.place}
                  </option>
                ))}
              </optgroup>
              <optgroup label="すべてのノード">
                {data.nodes
                  .filter((n) => !cpNodes.has(n.id))
                  .map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.id} {n.landmark ?? ''}
                    </option>
                  ))}
              </optgroup>
            </select>
          </label>
          <label>
            目的地{' '}
            <select
              value={roomId}
              onChange={(e) => {
                setRoomId(e.target.value)
                setActive(undefined)
              }}
            >
              {data.rooms.length === 0 && <option value="">（部屋が未登録です）</option>}
              {data.rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}（{r.building}棟 {r.floor}階）
                </option>
              ))}
            </select>
          </label>
        </div>
        <CampusMap buildings={data.buildings} highlight={goalBuilding ? [goalBuilding] : []} height="min(65vh, 600px)">
          {route && <RouteLayer route={route} activeStep={active} />}
        </CampusMap>
      </div>

      <section className="panel">
        <h2>案内の内容</h2>
        {!start && <p className="hint">出発点を選んでください（ふつうは CP01 = 事務室）。</p>}
        {start && room && !route && (
          <p className="error-text">
            経路が見つかりません。出発点から「{room.name}」の入口ノード（{room.node}）まで、辺がつながっているか確かめてください。
          </p>
        )}
        {route && (
          <>
            <p>
              <b>{room!.name}</b>まで 約{roundDistance(route.distance)}m
              {route.floorsClimbed > 0 && `・階段 ${route.floorsClimbed}階分`}・徒歩 約{Math.max(1, Math.round(route.seconds / 60))}分
            </p>
            <ol className="list" style={{ listStyle: 'decimal', paddingLeft: 24 }}>
              {route.steps.map((s, i) => (
                <li
                  key={i}
                  style={{ cursor: 'pointer', borderColor: active === i ? 'var(--selected)' : undefined }}
                  onClick={() => setActive(active === i ? undefined : i)}
                >
                  {s.text}
                  <div className="meta">
                    {s.from.id} → {s.to.id}（{s.floor}階・{s.distance.toFixed(1)}m）
                    {s.checkpoint && `・QR ${s.checkpoint}`}
                  </div>
                </li>
              ))}
            </ol>
            <p className="hint">区間をタップすると、地図でその区間が強調されます。目印の言葉はノードの「目印」で直せます。</p>
          </>
        )}
      </section>
    </div>
  )
}
