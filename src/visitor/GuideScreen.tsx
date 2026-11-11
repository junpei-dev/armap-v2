import type { Route } from '../core/route.ts'
import type { Room } from '../types.ts'

// ③ 案内（仮）
// 「次へ」で一歩ずつ進む本番の案内画面は第5週に作る（手順書 7章）。
// それまでは、区間ごとの案内文を一覧で見せる

type Props = { route: Route; room: Room; onBack: () => void; onFinish: () => void }

export default function GuideScreen({ route, room, onBack, onFinish }: Props) {
  return (
    <main className="v-screen">
      <button type="button" className="v-back" onClick={onBack}>
        ‹ 全体マップに戻る
      </button>
      <section className="v-card">
        <h1 className="v-dest">{room.name}への道順</h1>
        <ol className="v-steps">
          {route.steps.map((s, i) => (
            <li key={i}>{s.text}</li>
          ))}
        </ol>
        <p className="v-note">一歩ずつの案内画面は準備中です。</p>
      </section>
      <div className="v-actions">
        <button type="button" className="v-secondary" onClick={onFinish}>
          別の場所を探す
        </button>
      </div>
    </main>
  )
}
