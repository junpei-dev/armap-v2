import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import { fetchCampusData } from '../api/visitor.ts'
import { placeNodes, START_CHECKPOINT_ID } from '../core/campus.ts'
import { angleDiff, normalizeAngle } from '../core/geometry.ts'
import { anchorOffset, confidence, planHeading } from '../core/heading.ts'
import { planRoute, startHint, stepBearing, stepForNode } from '../core/route.ts'
import {
  requestOrientationPermission,
  savedSensorStatus,
  type SensorStatus,
  useDeviceHeading,
} from '../hooks/useDeviceHeading.ts'
import type { CampusData } from '../types.ts'
import ArrivedScreen from './ArrivedScreen.tsx'
import CameraOverlay from './CameraOverlay.tsx'
import GuideScreen from './GuideScreen.tsx'
import OverviewScreen from './OverviewScreen.tsx'
import PermissionScreen from './PermissionScreen.tsx'
import ScanOverlay from './ScanOverlay.tsx'
import StartScreen from './StartScreen.tsx'
import { initialState, saveState, visitorReducer } from './state.ts'
import './visitor.css'

// 来校者向けの画面の入口（設計書 7.1）
// ① スタート → ② 全体マップ → ③ 案内 の順に進む

export default function VisitorHome() {
  const [state, dispatch] = useReducer(visitorReducer, window.location.search, initialState)
  const [data, setData] = useState<CampusData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sensor, setSensor] = useState<SensorStatus>(savedSensorStatus)
  const [askPermission, setAskPermission] = useState(false) // ⑦ 許可のお願いを出しているか
  const [overlay, setOverlay] = useState<'none' | 'camera' | 'scan'>('none')
  const [toast, setToast] = useState<string | null>(null)
  // QRで向きを合わせた記録（offset: 端末の角度→図面角度の差、step: そのときの区間、at: 時刻）
  const closeOverlay = useCallback(() => setOverlay('none'), [])
  const [anchor, setAnchor] = useState<{ offset: number; step: number; at: number } | null>(null)
  const { heading, headingRef, working } = useDeviceHeading(state.screen === 'guide' && sensor === 'granted')

  useEffect(() => {
    fetchCampusData().then(setData, (e: Error) => setError(e.message))
  }, [])

  // 状態が変わるたびに保存。QR の ?cp=… は一度読んだら URL から消す（再読み込みで目的地が消えないように）
  useEffect(() => {
    saveState(state)
    if (window.location.search) history.replaceState(null, '', window.location.pathname)
  }, [state])

  // お知らせは4秒で消す
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  // 画面が変わったら一番上から表示する
  // ※ 新しいブラウザでは scrollTo が Promise を返す。そのまま返すと React が「後片付けの関数」と
  //   取り違えて止まるので、必ず { } で囲んで何も返さないようにする
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [state.screen, state.step])

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

  /** QRを読んだ（要件 F-30〜F-32）: 向きの基準を合わせ、その地点の区間へ。経路の外なら引き直す */
  const onScanned = useCallback(
    (cpId: string) => {
      const cp = data?.checkpoints.find((c) => c.id === cpId)
      if (!cp) {
        setToast('このQRコードは登録されていません')
        return
      }
      let step = 0
      if (route && stepForNode(route, cp.node) !== null) {
        step = stepForNode(route, cp.node)!
        dispatch({ type: 'jumpTo', step })
      } else {
        dispatch({ type: 'rerouteFrom', cp: cp.id })
      }
      const h = headingRef.current
      if (h !== null) setAnchor({ offset: anchorOffset(cp.facing, h), step, at: Date.now() })
      const node = data?.nodes.find((n) => n.id === cp.node)
      setToast(`現在地を「${node?.landmark ?? cp.place}」に合わせました`)
    },
    [data, route, headingRef],
  )

  /**
   * マーカーAR用: そのQRの地点から最初に進む向きを、QR（壁）を見て立った人から見た角度で返す
   * 壁を見ている人の向き = 掲示面の向き + 180。そこから最初の区間の向きへの差
   */
  const arrowFor = useCallback(
    (cpId: string): number | null => {
      const cp = data?.checkpoints.find((c) => c.id === cpId)
      if (!data || !cp || !room) return null
      const r = planRoute(placed, data.edges, data.checkpoints, data.config, cp.node, room.node, room.name)
      const bearing = r && r.steps.length > 0 ? stepBearing(r.steps[0]) : null
      return bearing === null ? null : angleDiff(normalizeAngle(cp.facing + 180), bearing)
    },
    [data, placed, room],
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
      {askPermission && (
        <PermissionScreen
          onAllow={async () => {
            setSensor(await requestOrientationPermission())
            setAskPermission(false)
            dispatch({ type: 'startGuide' })
          }}
          onSkip={() => {
            setSensor('denied')
            setAskPermission(false)
            dispatch({ type: 'startGuide' })
          }}
        />
      )}
      {!askPermission && screen === 'overview' && room && route && (
        <OverviewScreen
          data={data}
          room={room}
          route={route}
          originLabel={origin.label}
          onBack={() => dispatch({ type: 'back' })}
          onStart={() => {
            // iPhone で、まだ動きセンサーの許可を聞いていなければ ⑦ を出す
            if (sensor === 'unknown') setAskPermission(true)
            else dispatch({ type: 'startGuide' })
          }}
        />
      )}
      {screen === 'guide' && room && route && (
        <GuideScreen
          data={data}
          route={route}
          room={room}
          step={state.step}
          startHint={startHint(route, data.checkpoints)}
          onNext={() => dispatch({ type: 'next', lastStep: route.steps.length - 1 })}
          onPrev={() => dispatch({ type: 'prev' })}
          onOverview={() => dispatch({ type: 'back' })}
          onCamera={() => setOverlay('camera')}
          onScan={() => setOverlay('scan')}
        />
      )}
      {screen === 'guide' && route && overlay === 'camera' && (
        <CameraOverlay
          step={route.steps[Math.min(state.step, route.steps.length - 1)]}
          targetBearing={stepBearing(route.steps[Math.min(state.step, route.steps.length - 1)])}
          userHeading={anchor && heading !== null ? planHeading(heading, anchor.offset) : null}
          confidence={confidence(
            anchor ? { at: anchor.at, stepsSince: Math.max(0, state.step - anchor.step) } : null,
            Date.now(),
            sensor === 'granted' && working,
          )}
          isLast={state.step >= route.steps.length - 1}
          onNext={() => dispatch({ type: 'next', lastStep: route.steps.length - 1 })}
          onScan={() => setOverlay('scan')}
          onClose={() => setOverlay('none')}
        />
      )}
      {overlay === 'scan' && <ScanOverlay onFound={onScanned} onClose={closeOverlay} arrowFor={arrowFor} />}
      {toast && (
        <div className="v-toast" role="status">
          {toast}
        </div>
      )}
      {screen === 'arrived' && room && (
        <ArrivedScreen data={data} room={room} onBack={() => dispatch({ type: 'back' })} onFinish={() => dispatch({ type: 'reset' })} />
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
