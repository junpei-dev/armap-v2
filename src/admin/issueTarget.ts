import type { AdminData, Issue } from '../types.ts'

// 検査の問題（Issue）が、どのノードのことかを調べる（2026-11-16 追加）
// 問題の一覧から「地図で見る」で、そのノードへ飛べるようにするため
//   「ノード OUT-1」「ノード A・B」→ そのノード
//   「辺 A → B」              → A（と B）
//   「部屋 職員室（R-1-1F-01）」 → その部屋の入口のノード
//   「チェックポイント CP01」    → そのチェックポイントのノード
export function issueNodeIds(issue: Pick<Issue, 'target'>, data: Pick<AdminData, 'nodes' | 'rooms' | 'checkpoints'>): string[] {
  const t = issue.target
  const exists = (id: string) => data.nodes.some((n) => n.id === id)
  let ids: string[] = []
  if (t.startsWith('ノード ')) ids = t.slice(4).split('・')
  else if (t.startsWith('辺 ')) ids = t.slice(2).split(' → ')
  else if (t.startsWith('部屋 ')) {
    const roomId = /（([^（）]+)）$/.exec(t)?.[1]
    const room = data.rooms.find((r) => r.id === roomId)
    if (room) ids = [room.node]
  } else if (t.startsWith('チェックポイント ')) {
    const cp = data.checkpoints.find((c) => c.id === t.slice(9).trim())
    if (cp) ids = [cp.node]
  }
  return ids.map((s) => s.trim()).filter(exists)
}
