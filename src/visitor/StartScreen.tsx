import { useMemo, useState } from 'react'
import Icon from '../components/Icon.tsx'
import { CP_ROOM_PREFIX, roomPlace } from '../core/campus.ts'
import { type CampusData, ROOM_CATEGORIES, ROOM_CATEGORY_LABELS, type Room } from '../types.ts'

// ① スタート（要件 F-03・F-04・F-10〜F-12）
// 現在地を示し、目的地を分類ごとの一覧から選ぶ。名前・別名で絞り込める

type Props = {
  data: CampusData
  originLabel: string
  originCp: string
  onChooseOrigin: (cp: string) => void
  onChooseRoom: (roomId: string) => void
}

export default function StartScreen({ data, originLabel, originCp, onChooseOrigin, onChooseRoom }: Props) {
  const [query, setQuery] = useState('')
  const [changingOrigin, setChangingOrigin] = useState(false)
  const buildings = useMemo(() => new Map(data.buildings.map((b) => [b.id, b])), [data.buildings])

  // 検索: 名前・図面上の名前・別名に含まれていれば表示。全角・半角（３と3、ＣＡＤとCAD）の違いは同じとみなす
  const q = norm(query.trim())
  // いまいる場所（QRの地点）そのものは、目的地に出さない
  const originNode = data.checkpoints.find((c) => c.id === originCp)?.node
  const candidates = data.rooms.filter((r) => r.node !== originNode)
  const rooms = q
    ? candidates.filter((r) => [r.name, r.drawingName, ...r.aliases].some((s) => norm(s).includes(q)))
    : candidates

  // QRを貼った場所（事務室・生徒指導部・体育館など）は「主な場所」として先に出す
  const main = rooms.filter((r) => r.id.startsWith(CP_ROOM_PREFIX))
  const others = rooms.filter((r) => !r.id.startsWith(CP_ROOM_PREFIX))
  const grouped = ROOM_CATEGORIES.map((c) => ({ category: c, rooms: others.filter((r) => r.category === c) })).filter(
    (g) => g.rooms.length > 0,
  )

  const placeOf = (r: Room) => roomPlace(r, data.buildings)

  return (
    <main className="v-screen">
      <header className="v-hero">
        <img src="/icon.png" alt="" width={44} height={44} />
        <div>
          <div className="v-school">宮崎県立延岡工業高等学校</div>
          <h1>校内案内</h1>
        </div>
      </header>

      <section className="v-card v-origin">
        <div className="v-label">いまいる場所</div>
        <div className="v-origin-row">
          <span className="v-pin" aria-hidden>
            <Icon name="pin" size={22} />
          </span>
          <strong>{originLabel}</strong>
          {data.checkpoints.length > 1 && (
            <button type="button" className="v-link" onClick={() => setChangingOrigin(!changingOrigin)}>
              {changingOrigin ? '閉じる' : '変更'}
            </button>
          )}
        </div>
        {changingOrigin && (
          <ul className="v-origin-list">
            {data.checkpoints.map((c) => {
              const node = data.nodes.find((n) => n.id === c.node)
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    className={c.id === originCp ? 'on' : ''}
                    onClick={() => {
                      onChooseOrigin(c.id)
                      setChangingOrigin(false)
                    }}
                  >
                    {node?.landmark ?? c.place}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <h2 className="v-question">どこへ行きますか？</h2>
      <label className="v-search">
        <Icon name="search" size={20} />
        <input
          type="search"
          placeholder="部屋の名前で探す（例: 職員室）"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="部屋の名前で探す"
        />
      </label>

      {main.length > 0 && (
        <section className="v-group">
          <h3>主な場所</h3>
          <RoomList rooms={main} placeOf={placeOf} onChoose={onChooseRoom} />
        </section>
      )}
      {grouped.length === 0 && main.length === 0 && <p className="v-note">「{query.trim()}」に合う場所が見つかりません。</p>}
      {grouped.map((g) => (
        <section key={g.category} className="v-group">
          <h3>{ROOM_CATEGORY_LABELS[g.category]}</h3>
          {/* 部屋が多い分類（普通教室など）は、棟ごとに折りたたむ。検索中は全部見せる */}
          {!q && g.rooms.length > GROUP_THRESHOLD ? (
            byBuilding(g.rooms).map(([bid, rooms]) => (
              <details key={bid} className="v-building">
                <summary>
                  {buildings.get(bid)?.name ?? `${bid}棟`}
                  <span className="v-count">{rooms.length}室</span>
                </summary>
                <RoomList rooms={rooms} placeOf={(r) => `${r.floor}階`} onChoose={onChooseRoom} />
              </details>
            ))
          ) : (
            <RoomList rooms={sortRooms(g.rooms)} placeOf={placeOf} onChoose={onChooseRoom} />
          )}
        </section>
      ))}

      <p className="v-note">歩きながら画面を見続けないでください。周りに気をつけてお進みください。</p>
    </main>
  )
}

/** これより多い分類は、棟ごとに折りたたむ */
const GROUP_THRESHOLD = 8

/** 階 → 名前 の順に並べる */
function sortRooms(rooms: Room[]): Room[] {
  return [...rooms].sort((a, b) => a.building.localeCompare(b.building, 'ja', { numeric: true }) || a.floor - b.floor || a.name.localeCompare(b.name, 'ja', { numeric: true }))
}

/** 棟ごとにまとめる（棟番号の順） */
function byBuilding(rooms: Room[]): [string, Room[]][] {
  const map = new Map<string, Room[]>()
  for (const r of sortRooms(rooms)) map.set(r.building, [...(map.get(r.building) ?? []), r])
  return [...map.entries()]
}

function RoomList({ rooms, placeOf, onChoose }: { rooms: Room[]; placeOf: (r: Room) => string; onChoose: (id: string) => void }) {
  return (
    <ul className="v-rooms">
      {rooms.map((r) => (
        <li key={r.id}>
          <button type="button" onClick={() => onChoose(r.id)}>
            <span className="v-room-name">{r.name}</span>
            <span className="v-room-place">{placeOf(r)}</span>
            <span className="v-chevron">
              <Icon name="chevron" size={18} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/** 全角・半角や大文字・小文字の違いをそろえる（３→3、Ｃ→c） */
function norm(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/\s+/g, '')
}
