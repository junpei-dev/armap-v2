import { createContext, useContext } from 'react'
import type { AdminUser } from '../api/admin.ts'
import type { AdminData, EditableTable, Issue } from '../types.ts'

// 管理コンソールの画面どうしで共有するもの（読み込んだデータ・保存の関数など）

export type AdminContextValue = {
  user: AdminUser
  data: AdminData
  /** 保存して、成功したらデータを読み込み直す。失敗したら画面上部に理由を出し false を返す */
  saveAndReload: (
    table: EditableTable,
    action: 'insert' | 'update' | 'delete',
    valueOrId: unknown,
    okMessage: string,
  ) => Promise<{ ok: boolean; id?: number | string }>
  reload: () => Promise<void>
  notify: (message: string, issues?: Issue[]) => void
}

export const AdminContext = createContext<AdminContextValue | null>(null)

export function useAdmin(): AdminContextValue {
  const v = useContext(AdminContext)
  if (!v) throw new Error('AdminContext の外で使われています')
  return v
}
