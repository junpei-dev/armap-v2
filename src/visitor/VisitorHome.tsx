import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { fetchCampusData } from '../api/visitor.ts'
import { placeNodes, START_CHECKPOINT_ID } from '../core/campus.ts'
import { angleDiff, normalizeAngle, planAngle } from '../core/geometry.ts'
import { anchorOffset, averageAngles, confidence, planHeading } from '../core/heading.ts'
import { planRoute, startHint, stepBearing, stepForNode } from '../core/route.ts'
import { STRIDE_M, stepProgress, stepTargetName, walkedPath } from '../core/steps.ts'
import CampusMap from '../components/CampusMap.tsx'
import RouteLayer from '../components/RouteLayer.tsx'
import {
  requestOrientationPermission,
  savedSensorStatus,
  type SensorStatus,
  useDeviceHeading,
} from '../hooks/useDeviceHeading.ts'
import { useStepCounter } from '../hooks/useStepCounter.ts'
import type { CampusData } from '../types.ts'
import ArrivedScreen from './ArrivedScreen.tsx'
import CameraOverlay from './CameraOverlay.tsx'
import GuideScreen from './GuideScreen.tsx'
import OverviewScreen from './OverviewScreen.tsx'
import PermissionScreen from './PermissionScreen.tsx'
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
  const [camera, setCamera] = useState(false) // ④ カメラ案内を開いているか
  const [toast, setToast] = useState<string | null>(null)
  // QRで向きを合わせた記録（offset: 端末の角度→図面角度の差、step: そのときの区間、at: 時刻）
  const [anchor, setAnchor] = useState<{ offset: number; step: number; at: number } | null>(null)
  const { heading, headingRef, working, elevation } = useDeviceHeading(state.screen === 'guide' && sensor === 'granted')

  // 歩数計: いまの区間を何m歩いたかの見積もりに使う（区間が変わるたび・QRを読むたびに 0 から数え直す）
  const { steps, working: stepsWorking } = useStepCounter(state.screen === 'guide' && sensor === 'granted')
  const walkKey = `${state.screen}/${state.originCp}/${state.destination}/${state.step}/${anchor?.at ?? 0}`
  const [walkBase, setWalkBase] = useState({ key: '', steps: 0 })
  if (walkBase.key !== walkKey) setWalkBase({ key: walkKey, steps })
  const walked = stepsWorking && walkBase.key === walkKey ? Math.max(0, steps - walkBase.steps) * STRIDE_M : stepsWorking ? 0 : null

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

  /**
   * QRを読んだ（要件 F-30〜F-32）: 向きの基準を合わせ、その地点の区間へ。経路の外なら引き直す
   * 移った先の区間の番号を返す（登録の無いQRなら null）
   */
  // QRを映している間に集めた「壁にまっすぐ向いた向き」（端末の角度）。平均して基準にする
  const wallSamples = useRef<{ cp: string; list: number[] }>({ cp: '', list: [] })

  const onScanned = useCallback(
    (cpId: string, yaw: number | null = null): number | null => {
      const cp = data?.checkpoints.find((c) => c.id === cpId)
      if (!cp) {
        setToast('このQRコードは登録されていません')
        return null
      }
      let step = 0
      if (route && stepForNode(route, cp.node) !== null) {
        step = stepForNode(route, cp.node)!
        dispatch({ type: 'jumpTo', step })
      } else {
        dispatch({ type: 'rerouteFrom', cp: cp.id })
      }
      const h = headingRef.current
      // 斜めから映していたら、その分（yaw）を足して「壁にまっすぐ向いた向き」にする
      wallSamples.current = { cp: cp.id, list: h !== null ? [h + (yaw ?? 0)] : [] }
      if (h !== null) setAnchor({ offset: anchorOffset(cp.facing, h + (yaw ?? 0)), step, at: Date.now() })
      const node = data?.nodes.find((n) => n.id === cp.node)
      setToast(`現在地を「${node?.landmark ?? cp.place}」に合わせました`)
      return step
    },
    [data, route, headingRef],
  )

  /** 同じQRを映し続けている間: 見積もりを集めて平均し、向きの基準を少しずつ正確にする（最大30回分） */
  const onRefine = useCallback(
    (cpId: string, yaw: number | null) => {
      const cp = data?.checkpoints.find((c) => c.id === cpId)
      const h = headingRef.current
      const w = wallSamples.current
      if (!cp || h === null || yaw === null || w.cp !== cpId || w.list.length >= 30) return
      w.list.push(h + yaw)
      const avg = averageAngles(w.list)
      if (avg !== null) setAnchor((a) => (a ? { ...a, offset: anchorOffset(cp.facing, avg) } : a))
    },
    [data, headingRef],
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

  // いまの区間と、その中での進み具合（歩数計が使えるときだけ）
  const stepIndex = route ? Math.min(state.step, route.steps.length - 1) : 0
  const current = route?.steps[stepIndex] ?? null
  const progress = current && walked !== null ? stepProgress(current, walked, room?.name) : null
  const near = progress?.near ?? false
  // 次に目指す地点が、いまの位置（見積もり）から見てどの方向・どれだけ先か（カメラの地面の印に使う）
  const target = useMemo(() => {
    if (!current) return null
    const pts = current.nodes.map((n) => n.pos)
    const me = walkedPath(pts, walked ?? 0).at(-1) ?? current.from.pos
    const distance = Math.hypot(current.to.pos.x - me.x, current.to.pos.y - me.y)
    return distance < 1.5 ? null : { bearing: planAngle(me, current.to.pos), distance }
  }, [current, walked])
  // 区間の終わりに近づいたら、1回だけ震えて知らせる
  useEffect(() => {
    if (near) navigator.vibrate?.([80, 60, 80])
  }, [near, walkKey])

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
          walked={walked}
          progress={progress}
          onNext={() => dispatch({ type: 'next', lastStep: route.steps.length - 1 })}
          onPrev={() => dispatch({ type: 'prev' })}
          onOverview={() => dispatch({ type: 'back' })}
          onCamera={() => setCamera(true)}
        />
      )}
      {screen === 'guide' && room && route && current && camera && (
        <CameraOverlay
          step={current}
          stepIndex={stepIndex}
          stepCount={route.steps.length}
          targetBearing={stepBearing(current)}
          targetName={stepTargetName(current, room.name)}
          target={target}
          elevation={elevation}
          progress={progress}
          mini={
            <CampusMap buildings={data.buildings} highlight={[room.building]} zoomToId="camera-focus" zoomKey={`${origin.cp.id}/${stepIndex}`} height={136}>
              <RouteLayer route={route} activeStep={stepIndex} animate focusId="camera-focus" progress={walked} />
            </CampusMap>
          }
          userHeading={anchor && heading !== null ? planHeading(heading, anchor.offset) : null}
          confidence={confidence(
            anchor ? { at: anchor.at, stepsSince: Math.max(0, state.step - anchor.step) } : null,
            Date.now(),
            sensor === 'granted' && working,
          )}
          isLast={state.step >= route.steps.length - 1}
          onFound={onScanned}
          onRefine={onRefine}
          arrowFor={arrowFor}
          onNext={() => {
            // 着いたら、カメラは閉じて到着の画面へ
            if (state.step >= route.steps.length - 1) setCamera(false)
            dispatch({ type: 'next', lastStep: route.steps.length - 1 })
          }}
          onPrev={() => dispatch({ type: 'prev' })}
          onClose={() => setCamera(false)}
        />
      )}
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
