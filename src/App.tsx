import AdminHome from './admin/AdminHome.tsx'
import VisitorHome from './visitor/VisitorHome.tsx'

// URL が /admin で始まるときは管理コンソール、それ以外は来校者向けの画面を出す（設計書 9章）
export default function App() {
  const isAdmin = window.location.pathname.startsWith('/admin')
  return isAdmin ? <AdminHome /> : <VisitorHome />
}
