import { type FormEvent, useEffect, useState } from 'react'

// 管理コンソールの入口（第1週: ログイン・ログアウトの確認用）
// 本番の画面（地図エディタ・現地調査メモ…）は第2週以降に作る（手順書 4章）

type User = { email: string; role: 'teacher' | 'student' }

export default function AdminHome() {
  // undefined = 確認中 / null = ログインしていない
  const [user, setUser] = useState<User | null | undefined>(undefined)

  useEffect(() => {
    fetch('/api/admin/whoami')
      .then((res) => (res.ok ? res.json() : null))
      .then(setUser)
      .catch(() => setUser(null))
  }, [])

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    setUser(null)
  }

  return (
    <main style={{ padding: '24px 16px', maxWidth: 480, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22 }}>管理コンソール</h1>
      {user === undefined && <p>確認中…</p>}
      {user === null && <LoginForm onLogin={setUser} />}
      {user && (
        <>
          <p>ログイン中: {user.email}</p>
          <p style={{ color: 'var(--color-sub)' }}>地図エディタなどの機能は準備中です。</p>
          <button type="button" onClick={logout}>
            ログアウト
          </button>
        </>
      )}
    </main>
  )
}

function LoginForm({ onLogin }: { onLogin: (user: User) => void }) {
  const [email, setEmail] = useState('')
  const [passcode, setPasscode] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSending(true)
    setMessage('')
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, passcode }),
    })
    const data = await res.json().catch(() => ({}))
    setSending(false)
    if (!res.ok) {
      setMessage(data.error ?? 'ログインできませんでした')
      return
    }
    // ログインできたら、権限（教員/生徒）も含めて取り直す
    const me = await fetch('/api/admin/whoami').then((r) => r.json())
    onLogin(me)
  }

  const field = { display: 'block', width: '100%', fontSize: 16, padding: 8, marginTop: 4 }
  return (
    <form onSubmit={submit}>
      <label style={{ display: 'block', marginBottom: 12 }}>
        学校のメールアドレス
        <input
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={field}
        />
      </label>
      <label style={{ display: 'block', marginBottom: 12 }}>
        パスコード（先生から配られたもの）
        <input
          type="password"
          autoComplete="current-password"
          required
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          placeholder="XXXX-XXXX-XXXX"
          style={field}
        />
      </label>
      {message && <p style={{ color: '#b00020' }}>{message}</p>}
      <button type="submit" disabled={sending} style={{ fontSize: 16, padding: '8px 24px' }}>
        {sending ? 'ログイン中…' : 'ログイン'}
      </button>
    </form>
  )
}
