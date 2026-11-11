import CampusMap from '../components/CampusMap.tsx'
import RouteLayer from '../components/RouteLayer.tsx'
import type { Action, Route } from '../core/route.ts'
import type { CampusData, Room } from '../types.ts'

// ③ 案内（要件 F-21〜F-28・F-31）
// 区間を1つずつ見せる。目印に着いたら「次へ」。押し間違えたら「戻る」。
// 小さな地図は今の区間まで拡大し、自分の位置を表す三角が道順に沿って進む

type Props = {
  data: CampusData
  route: Route
  room: Room
  step: number
  startHint: string | null // 最初の区間だけに出す「○○を背にして、右へ進みます」
  onNext: () => void
  onPrev: () => void
  onOverview: () => void
}

export default function GuideScreen({ data, route, room, step, startHint, onNext, onPrev, onOverview }: Props) {
  const s = route.steps[Math.min(step, route.steps.length - 1)]
  const isLast = step >= route.steps.length - 1

  return (
    <main className="v-screen v-guide">
      <div className="v-guide-top">
        <button type="button" className="v-back" onClick={onOverview}>
          ‹ 全体マップ
        </button>
        <span className="v-progress">
          {step + 1} / {route.steps.length}
        </span>
      </div>

      <section className="v-card v-instruction" aria-live="polite">
        <ActionIcon action={s.action} />
        <div>
          {step === 0 && startHint && <p className="v-start-hint">{startHint}</p>}
          <p className="v-instruction-text">{s.text}</p>
          <p className="v-instruction-floor">
            いま {s.floor}階{s.checkpoint && '・この先にQRコードがあります（読まなくても進めます）'}
          </p>
        </div>
      </section>

      <CampusMap
        buildings={data.buildings}
        highlight={[room.building]}
        zoomToId="guide-focus"
        zoomKey={step}
        height="min(42vh, 360px)"
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

/** 区間の終わりでする動作を、大きな記号で示す */
function ActionIcon({ action }: { action: Action }) {
  let symbol = '↑'
  let label = 'まっすぐ'
  if (action.type === 'arrive') {
    symbol = '●'
    label = '到着'
  } else if (action.type === 'stairs') {
    symbol = action.up ? '⇧' : '⇩'
    label = `階段で${action.toFloor}階へ`
  } else if (action.dir === 'right') {
    symbol = '↱'
    label = '右へ'
  } else if (action.dir === 'left') {
    symbol = '↰'
    label = '左へ'
  } else if (action.dir === 'back') {
    symbol = '↶'
    label = '引き返す'
  }
  return (
    <div className={`v-icon v-icon-${action.type}`} aria-hidden>
      <span className="v-icon-symbol">{symbol}</span>
      <span className="v-icon-label">{label}</span>
    </div>
  )
}
