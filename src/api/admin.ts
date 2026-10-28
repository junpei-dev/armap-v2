import type { AdminData, EditableTable, Issue } from '../types.ts'

// 管理コンソールからAPIを呼ぶ関数（画面からはここだけを使う。設計書 9章）

export type AdminUser = { email: string; role: 'teacher' | 'student' }

/** 保存できなかったときのエラー。issues に直すべき問題が入る */
export class SaveError extends Error {
  issues: Issue[]
  constructor(message: string, issues: Issue[] = []) {
    super(message)
    this.issues = issues
  }
}

export async function fetchMe(): Promise<AdminUser | null> {
  const res = await fetch('/api/admin/whoami')
  return res.ok ? res.json() : null
}

export async function login(email: string, passcode: string): Promise<void> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, passcode }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? 'ログインできませんでした')
  }
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' })
}

export async function fetchAdminData(): Promise<AdminData> {
  const res = await fetch('/api/admin/data')
  if (res.status === 401) throw new Error('ログインが切れました。もう一度ログインしてください')
  if (!res.ok) throw new Error(`データを読み込めませんでした（${res.status}）`)
  return res.json()
}

type SaveResult = { ok: true; issues?: Issue[]; id?: number | string }

/** 追加・修正・削除。失敗したら SaveError を投げる */
export async function save(
  table: EditableTable,
  action: 'insert' | 'update' | 'delete',
  valueOrId: unknown,
): Promise<SaveResult> {
  const method = action === 'insert' ? 'POST' : action === 'update' ? 'PUT' : 'DELETE'
  const url =
    action === 'delete'
      ? `/api/admin/${table}?id=${encodeURIComponent(String(valueOrId))}`
      : `/api/admin/${table}`
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: action === 'delete' ? undefined : JSON.stringify({ value: valueOrId }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new SaveError(data.error ?? `保存できませんでした（${res.status}）`, data.issues ?? [])
  return data
}
