import { lazy, Suspense } from 'react'

// URL が /admin で始まるときは管理コンソール、それ以外は来校者向けの画面を出す（設計書 9章）
// それぞれを別のファイルに分けて、必要な方だけを読み込む
// （来校者がモバイル回線で、管理コンソールの分まで読み込まずに済むように）
const AdminHome = lazy(() => import('./admin/AdminHome.tsx'))
const VisitorHome = lazy(() => import('./visitor/VisitorHome.tsx'))

export default function App() {
  const isAdmin = window.location.pathname.startsWith('/admin')
  return (
    <Suspense fallback={<p style={{ padding: 24, textAlign: 'center' }}>読み込み中…</p>}>
      {isAdmin ? <AdminHome /> : <VisitorHome />}
    </Suspense>
  )
}
