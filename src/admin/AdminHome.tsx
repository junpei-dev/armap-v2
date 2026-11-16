import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { type AdminUser, fetchAdminData, fetchMe, login, logout, save, SaveError } from '../api/admin.ts'
import type { AdminData, Issue } from '../types.ts'
import { AdminContext, type AdminContextValue } from './AdminContext.tsx'
import './admin.css'
import CheckpointsEditor from './CheckpointsEditor.tsx'
import HistoryPage from './HistoryPage.tsx'
import MapEditor from './MapEditor.tsx'
import RoomsEditor from './RoomsEditor.tsx'
import RoutePreview from './RoutePreview.tsx'
import SurveyNotes from './SurveyNotes.tsx'
import TopPage from './TopPage.tsx'
import IssueItem from './IssueItem.tsx'

// 管理コンソールの入口（設計書 7.4）
// ログインの確認 → データの読み込み → タブで各画面を切り替える

const TABS = [
  { id: 'top', label: 'トップ' },
  { id: 'survey', label: '現地調査メモ' },
  { id: 'map', label: '地図エディタ' },
  { id: 'rooms', label: '部屋' },
  { id: 'checkpoints', label: 'チェックポイント' },
  { id: 'preview', label: '経路の確認' },
  { id: 'history', label: '変更履歴' },
] as const
type TabId = (typeof TABS)[number]['id']

function tabFromHash(): TabId {
  const h = window.location.hash.replace('#', '')
  return (TABS.find((t) => t.id === h)?.id ?? 'top') as TabId
}

export default function AdminHome() {
  // undefined = 確認中 / null = ログインしていない
  const [user, setUser] = useState<AdminUser | null | undefined>(undefined)
  const [data, setData] = useState<AdminData | null>(null)
  const [tab, setTab] = useState<TabId>(tabFromHash)
  const [notice, setNotice] = useState<{ message: string; issues: Issue[]; error: boolean } | null>(null)
  const [focusRequest, setFocusRequest] = useState<{ id: string; seq: number } | null>(null)
  const showNode = useCallback((id: string) => {
    setFocusRequest({ id, seq: Date.now() })
    window.location.hash = '#map'
  }, [])

  useEffect(() => {
    fetchMe().then(setUser).catch(() => setUser(null))
    const onHash = () => setTab(tabFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const reload = useCallback(async () => {
    try {
      setData(await fetchAdminData())
    } catch (e) {
      setNotice({ message: (e as Error).message, issues: [], error: true })
    }
  }, [])

  useEffect(() => {
    if (user) reload()
  }, [user, reload])

  const notify = useCallback((message: string, issues: Issue[] = []) => {
    setNotice({ message, issues, error: issues.length > 0 })
  }, [])

  const saveAndReload: AdminContextValue['saveAndReload'] = useCallback(
    async (table, action, valueOrId, okMessage) => {
      try {
        const result = await save(table, action, valueOrId)
        setNotice({ message: okMessage, issues: [], error: false })
        await reload()
        return { ok: true, id: result.id }
      } catch (e) {
        const issues = e instanceof SaveError ? e.issues : []
        setNotice({ message: (e as Error).message, issues, error: true })
        return { ok: false }
      }
    },
    [reload],
  )

  // 成功のお知らせは4秒で消す（エラーは消さない）
  useEffect(() => {
    if (!notice || notice.error) return
    const t = setTimeout(() => setNotice(null), 4000)
    return () => clearTimeout(t)
  }, [notice])

  if (user === undefined) return <p className="admin-pad">確認中…</p>
  const fatalCount = data?.issues.filter((i) => i.level === 'fatal').length ?? 0
  const warnCount = data?.issues.filter((i) => i.level === 'warning').length ?? 0
  const openNotes = data?.survey.filter((s) => !s.resolved).length ?? 0
  if (user === null) return <LoginForm onLogin={setUser} />

  return (
    <div className="admin">
      <header className="admin-header">
        <div className="admin-bar">
          <img src="/icon.png" alt="" width={28} height={28} />
          <strong>校内案内 管理</strong>
          <span className="admin-user">
            <span>{user.email.split('@')[0]}</span>
            <a href="/" target="_blank" rel="noreferrer">
              来校者の画面
            </a>
            <button
              type="button"
              onClick={async () => {
                await logout()
                setUser(null)
              }}
            >
              ログアウト
            </button>
          </span>
        </div>
        <nav className="admin-tabs">
          {TABS.map((t) => (
            <a key={t.id} href={`#${t.id}`} className={t.id === tab ? 'active' : ''}>
              {t.label}
              {/* 直す所・未対応のメモがあるタブに、件数の印を付ける */}
              {t.id === 'top' && fatalCount > 0 && <span className="badge fatal">{fatalCount}</span>}
              {t.id === 'top' && fatalCount === 0 && warnCount > 0 && <span className="badge warn">{warnCount}</span>}
              {t.id === 'survey' && openNotes > 0 && <span className="badge">{openNotes}</span>}
            </a>
          ))}
        </nav>
      </header>

      {notice && (
        <div className={`admin-notice ${notice.error ? 'error' : ''}`} role="status">
          <span>{notice.message}</span>
          {notice.issues.length > 0 && (
            <ul>
              {notice.issues.map((i, k) =>
                data ? (
                  <IssueItem key={k} issue={i} data={data} onShow={showNode} />
                ) : (
                  <li key={k}>
                    {i.target}: {i.message}
                  </li>
                ),
              )}
            </ul>
          )}
          <button type="button" className="link" onClick={() => setNotice(null)}>
            閉じる
          </button>
        </div>
      )}

      {!data ? (
        <p className="admin-pad">データを読み込み中…</p>
      ) : (
        <AdminContext.Provider value={{ user, data, saveAndReload, reload, notify, showNode, focusRequest }}>
          <main className="admin-main">
            {tab === 'top' && <TopPage />}
            {tab === 'survey' && <SurveyNotes />}
            {tab === 'map' && <MapEditor />}
            {tab === 'rooms' && <RoomsEditor />}
            {tab === 'checkpoints' && <CheckpointsEditor />}
            {tab === 'preview' && <RoutePreview />}
            {tab === 'history' && <HistoryPage />}
          </main>
        </AdminContext.Provider>
      )}
    </div>
  )
}

function LoginForm({ onLogin }: { onLogin: (user: AdminUser) => void }) {
  const [email, setEmail] = useState('')
  const [passcode, setPasscode] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSending(true)
    setMessage('')
    try {
      await login(email, passcode)
      const me = await fetchMe()
      if (me) onLogin(me)
    } catch (err) {
      setMessage((err as Error).message)
    } finally {
      setSending(false)
    }
  }

  return (
    <main className="login">
      <form onSubmit={submit} className="form login-card">
        <header>
          <img src="/icon.png" alt="" width={44} height={44} />
          <div>
            延岡工業高校 校内案内
            <h1>管理コンソール</h1>
          </div>
        </header>
        <label>
          学校のメールアドレス
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          パスコード（先生から配られたもの）
          <input
            type="password"
            autoComplete="current-password"
            required
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="XXXX-XXXX-XXXX"
          />
        </label>
        {message && <p className="error-text">{message}</p>}
        <button type="submit" className="primary" disabled={sending}>
          {sending ? 'ログイン中…' : 'ログイン'}
        </button>
      </form>
    </main>
  )
}
