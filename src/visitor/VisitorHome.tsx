import { useEffect, useMemo, useReducer, useState } from 'react'
import { fetchCampusData } from '../api/visitor.ts'
import { placeNodes, START_CHECKPOINT_ID } from '../core/campus.ts'
import { planRoute } from '../core/route.ts'
import type { CampusData } from '../types.ts'
import GuideScreen from './GuideScreen.tsx'
import OverviewScreen from './OverviewScreen.tsx'
import StartScreen from './StartScreen.tsx'
import { initialState, saveState, visitorReducer } from './state.ts'
import './visitor.css'

// 来校者向けの画面の入口（設計書 7.1）
// ① スタート → ② 全体マップ → ③ 案内 の順に進む

export default function VisitorHome() {
  const [state, dispatch] = useReducer(visitorReducer, window.location.search, initialState)
  const [data, setData] = useState<CampusData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchCampusData().then(setData, (e: Error) => setError(e.message))
  }, [])

  // 状態が変わるたびに保存。QR の ?cp=… は一度読んだら URL から消す（再読み込みで目的地が消えないように）
  useEffect(() => {
    saveState(state)
    if (window.location.search) history.replaceState(null, '', window.location.pathname)
  }, [state])

  // 画面が変わったら一番上から表示する
  // ※ 新しいブラウザでは scrollTo が Promise を返す。そのまま返すと React が「後片付けの関数」と
  //   取り違えて止まるので、必ず { } で囲んで何も返さないようにする
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [state.screen])

  const placed = useMemo(() => (data ? placeNodes(data) : []), [data])

  // 出発点: 指定のQR地点。無い番号なら事務室（CP01）にする
  const origin = useMemo(() => {
    if (!data) return null
    const cp =
      data.checkpoints.find((c) => c.id === state.originCp) ??
      data.checkpoints.find((c) => c.id === START_CHECKPOINT_ID)
    if (!cp) return null
    const node = placed.find((n) => n.id === cp.node)
    return node ? { cp, node, label: node.landmark ?? cp.place } : null
  }, [data, placed, state.originCp])

  const room = data?.rooms.find((r) => r.id === state.destination) ?? null
  const route = useMemo(
    () =>
      data && origin && room
        ? planRoute(placed, data.edges, data.checkpoints, data.config, origin.node.id, room.node, room.name)
        : null,
    [data, placed, origin, room],
  )

  if (error) {
    return (
      <Message title="読み込めませんでした">
        <p>{error}</p>
        <p>電波の良い場所で、ページを読み込み直してください。</p>
      </Message>
    )
  }
  if (!data) return <Message title="読み込み中…" />
  if (!origin || data.rooms.length === 0) {
    return (
      <Message title="準備中です">
        <p>校内案内のデータを準備しています。お手数ですが、事務室でおたずねください。</p>
      </Message>
    )
  }

  // 目的地が消えた（データが直された）・経路が無い場合は、目的地の選び直しに戻す
  const screen = state.screen !== 'start' && (!room || !route) ? 'start' : state.screen

  return (
    <div className="visitor">
      {screen === 'start' && (
        <StartScreen
          data={data}
          originLabel={origin.label}
          originCp={origin.cp.id}
          onChooseOrigin={(cp) => dispatch({ type: 'setOrigin', cp })}
          onChooseRoom={(roomId) => dispatch({ type: 'chooseDestination', roomId })}
        />
      )}
      {screen === 'overview' && room && route && (
        <OverviewScreen
          data={data}
          room={room}
          route={route}
          originLabel={origin.label}
          onBack={() => dispatch({ type: 'back' })}
          onStart={() => dispatch({ type: 'startGuide' })}
        />
      )}
      {screen === 'guide' && room && route && (
        <GuideScreen route={route} room={room} onBack={() => dispatch({ type: 'back' })} onFinish={() => dispatch({ type: 'reset' })} />
      )}
    </div>
  )
}

function Message({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <main className="visitor visitor-message">
      <img src="/icon.png" alt="" width={56} height={56} />
      <h1>{title}</h1>
      {children}
    </main>
  )
}
