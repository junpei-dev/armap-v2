// ⑦ 許可のお願い（要件 F-05）
// iPhone は、動きセンサーを使うたびにボタン操作での許可が必要。
// 許可しなくても、地図と文字の案内で最後まで進める

type Props = { onAllow: () => void; onSkip: () => void }

export default function PermissionScreen({ onAllow, onSkip }: Props) {
  return (
    <main className="v-screen v-permission">
      <h1>カメラと動きセンサーについて</h1>
      <p>
        案内の途中で、カメラの映像に<strong>進む方向の矢印</strong>を重ねて表示できます。そのために、スマートフォンの
        <strong>動きセンサー</strong>（向きを知るため）と<strong>カメラ</strong>を使います。
      </p>
      <ul>
        <li>カメラの映像や位置の情報は、どこにも送りません</li>
        <li>許可しなくても、地図と文字の案内で目的地まで行けます</li>
      </ul>
      <p className="v-note">このあと表示される確認で「許可」を選んでください。</p>
      <div className="v-actions v-actions-2">
        <button type="button" className="v-secondary" onClick={onSkip}>
          使わずに進む
        </button>
        <button type="button" className="v-primary" onClick={onAllow}>
          許可して進む
        </button>
      </div>
    </main>
  )
}
