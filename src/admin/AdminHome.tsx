import { useEffect, useState } from 'react'

// 管理コンソールの仮の画面（第1週: Cloudflare Access のログイン確認用）
// 本番の画面（地図エディタ・現地調査メモ…）は第2週以降に作る（手順書 4章）
export default function AdminHome() {
  const [email, setEmail] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/whoami')
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data: { email: string | null }) => setEmail(data.email))
      .catch((err) => setError(String(err)))
  }, [])

  return (
    <main style={{ padding: '24px 16px', maxWidth: 640, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22 }}>管理コンソール</h1>
      {error && <p>ログイン情報を取得できませんでした（{error}）</p>}
      {!error && email === null && <p>確認中…</p>}
      {email && <p>ログイン中: {email}</p>}
      <p style={{ color: 'var(--color-sub)' }}>地図エディタなどの機能は準備中です。</p>
    </main>
  )
}
