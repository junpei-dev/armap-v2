import CampusMap from '../components/CampusMap.tsx'
import Icon from '../components/Icon.tsx'
import RouteLayer from '../components/RouteLayer.tsx'
import type { Action, Route } from '../core/route.ts'
import type { CampusData, Room } from '../types.ts'

// ③ 案内（要件 F-21〜F-28・F-31）
// 区間を1つずつ見せる。目印に着いたら「次へ」。押し間違えたら「戻る」。
// 小さな地図は今の区間まで拡大し、自分の位置を表す三角が道順に沿って進む。
// 「カメラで進む方向を見る」で ④ カメラ案内を開く（QRの読み取りと矢印の表示は、その1画面で行う）

type Props = {
  data: CampusData
  route: Route
  room: Room
  step: number
  startHint: string | null // 最初の区間だけに出す「○○を背にして、右へ進みます」
  onNext: () => void
  onPrev: () => void
  onOverview: () => void
  onCamera: () => void
}

export default function GuideScreen({ data, route, room, step, startHint, onNext, onPrev, onOverview, onCamera }: Props) {
  const s = route.steps[Math.min(step, route.steps.length - 1)]
  const isLast = step >= route.steps.length - 1

  return (
    <main className="v-screen v-guide">
      <div className="v-topbar">
        <button type="button" className="v-back" onClick={onOverview}>
          <Icon name="back" size={18} />
          全体マップ
        </button>
        <span className="v-topbar-title">{room.name} へ</span>
        <span className="v-progress">
          {step + 1} / {route.steps.length}
        </span>
      </div>
      {/* いま何番目の区間か（区間ごとに1本） */}
      <div className="v-progress-bar" aria-hidden>
        {route.steps.map((_, i) => (
          <i key={i} className={i < step ? 'done' : i === step ? 'now' : ''} />
        ))}
      </div>

      <section className="v-card v-instruction" aria-live="polite">
        <ActionIcon action={s.action} />
        <div>
          {step === 0 && startHint && <p className="v-start-hint">{startHint}</p>}
          <p className="v-instruction-text">{s.text}</p>
          <p className="v-instruction-floor">
            <span className="v-pill">いま {s.floor}階</span>
            {s.checkpoint && <span className="v-pill v-pill-me">この先にQRコード</span>}
          </p>
        </div>
      </section>

      <button type="button" className="v-camera-button" onClick={onCamera}>
        <span className="v-camera-icon">
          <Icon name="camera" size={26} />
        </span>
        <span>
          <strong>カメラで進む方向を見る</strong>
          <small>近くのQRコードを映すと、矢印が出ます</small>
        </span>
        <Icon name="chevron" size={18} />
      </button>

      <CampusMap
        buildings={data.buildings}
        highlight={[room.building]}
        zoomToId="guide-focus"
        zoomKey={step}
        height="min(40vh, 340px)"
      >
        <RouteLayer route={route} activeStep={step} animate focusId="guide-focus" />
      </CampusMap>

      <p className="v-note">
        {s.action.type === 'stairs' ? '階段の手前では立ち止まり、足元に気をつけてください。' : '歩きながら画面を見続けないでください。'}
      </p>

      <div className="v-actions v-actions-2">
        <button type="button" className="v-secondary" onClick={onPrev} disabled={step === 0}>
          戻る
        </button>
        <button type="button" className="v-primary" onClick={onNext}>
          {isLast ? '着いた' : '次へ'}
        </button>
      </div>
    </main>
  )
}

/** 区間の終わりでする動作を、大きな矢印の記号で示す */
function ActionIcon({ action }: { action: Action }) {
  let label = 'まっすぐ'
  // 記号の形（viewBox 0 0 48 48）。線で描く
  let path = 'M24 40V9M12 21L24 9l12 12'
  if (action.type === 'arrive') {
    label = '到着'
    path = 'M24 43s-13-12-13-22a13 13 0 0 1 26 0c0 10-13 22-13 22zM24 16.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9z'
  } else if (action.type === 'stairs') {
    label = `階段で${action.toFloor}階へ`
    path = action.up ? 'M5 41h9v-9h9v-9h9v-9h10M31 5h9v9' : 'M5 14h9v9h9v9h9v9h10M33 44h9v-9'
  } else if (action.dir === 'right') {
    label = '右へ'
    path = 'M14 41V22a6 6 0 0 1 6-6h18M29 7l9 9-9 9'
  } else if (action.dir === 'left') {
    label = '左へ'
    path = 'M34 41V22a6 6 0 0 0-6-6H10M19 7l-9 9 9 9'
  } else if (action.dir === 'back') {
    label = '引き返す'
    path = 'M32 41V19a9 9 0 0 0-18 0v14M6 25l8 8 8-8'
  }
  return (
    <div className={`v-icon v-icon-${action.type}`} aria-hidden>
      <svg viewBox="0 0 48 48" width="46" height="46" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
        <path d={path} />
      </svg>
      <span className="v-icon-label">{label}</span>
    </div>
  )
}
