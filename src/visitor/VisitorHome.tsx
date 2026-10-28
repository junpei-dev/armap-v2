import { useEffect, useState } from 'react'

// 来校者向けの仮の画面（第1週: 公開とAPIの動作確認用）
// 本番の画面（スタート・全体マップ・案内…）は第4週以降に作る（手順書 7章）
export default function VisitorHome() {
  // QR から開いたときの地点ID（例: ?cp=CP01）。無ければ事務室から始める（要件 F-01〜F-03）
  const checkpointId = new URLSearchParams(window.location.search).get('cp') ?? 'CP01'
  const [apiStatus, setApiStatus] = useState('確認中…')

  useEffect(() => {
    fetch('/api/data')
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data: { version: number }) => setApiStatus(`OK（データの版: ${data.version}）`))
      .catch((err) => setApiStatus(`エラー（${err}）`))
  }, [])

  return (
    <main style={{ padding: '24px 16px', maxWidth: 480, margin: '0 auto' }}>
      <img src="/icon.png" alt="" width={56} height={56} />
      <h1 style={{ fontSize: 22, margin: '8px 0' }}>延岡工業高校 校内案内</h1>
      <p style={{ color: 'var(--color-sub)' }}>準備中です。</p>
      <dl style={{ fontSize: 14 }}>
        <dt>出発地点ID</dt>
        <dd>{checkpointId}</dd>
        <dt>データAPI</dt>
        <dd>{apiStatus}</dd>
      </dl>
    </main>
  )
}
