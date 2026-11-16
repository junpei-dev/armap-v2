import type { AdminData, Issue } from '../types.ts'
import { issueNodeIds } from './issueTarget.ts'

// 問題の1行。どのノードのことか分かるときは「地図で見る」を付け、押すと地図エディタでそのノードへ飛ぶ

type Props = {
  issue: Issue
  data: Pick<AdminData, 'nodes' | 'rooms' | 'checkpoints'>
  onShow: (nodeId: string) => void
}

export default function IssueItem({ issue, data, onShow }: Props) {
  const ids = issueNodeIds(issue, data)
  return (
    <li className={issue.level === 'fatal' ? 'issue-fatal' : undefined}>
      {issue.target}: {issue.message}
      {ids.map((id) => (
        <button key={id} type="button" className="issue-jump" onClick={() => onShow(id)}>
          {ids.length > 1 ? `${id} を地図で見る` : '地図で見る'}
        </button>
      ))}
    </li>
  )
}
