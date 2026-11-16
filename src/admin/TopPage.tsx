import { useMemo, useState } from 'react'
import { buildingMismatches, inputFromTap } from '../core/campus.ts'
import type { GraphNode } from '../types.ts'
import { useAdmin } from './AdminContext.tsx'
import IssueItem from './IssueItem.tsx'

// 管理トップ：データの件数と、検査で見つかった問題の一覧（設計書 7.4）
export default function TopPage() {
  const { data, reload, showNode, saveAndReload, notify } = useAdmin()
  const mismatches = useMemo(() => buildingMismatches(data), [data])
  const [fixing, setFixing] = useState(false)

  /** 位置と棟の設定が合っていないノードを、位置に合わせてまとめて直す */
  async function fixBuildings() {
    if (!confirm(`${mismatches.length}個のノードの棟の設定を、置いてある位置に合わせて直しますか？（変更履歴から元に戻せます）`)) return
    setFixing(true)
    let ok = 0
    for (const m of mismatches) {
      const value: GraphNode = { ...m.node, building: m.suggested?.id, local: undefined, pos: undefined, ...inputFromTap(m.pos, m.suggested) }
      const r = await saveAndReload('nodes', 'update', value, `ノード ${m.node.id} の棟を直しました`)
      if (r.ok) ok++
    }
    setFixing(false)
    notify(`${ok}個のノードの棟を直しました`)
  }
  const fatal = data.issues.filter((i) => i.level === 'fatal')
  const warnings = data.issues.filter((i) => i.level === 'warning')
  const openNotes = data.survey.filter((s) => !s.resolved).length

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 900 }}>
      <div className="stats">
        <div>
          <b>{data.buildings.length}</b>棟
        </div>
        <div>
          <b>{data.nodes.length}</b>ノード
        </div>
        <div>
          <b>{data.edges.length}</b>辺
        </div>
        <div>
          <b>{data.rooms.length}</b>部屋
        </div>
        <div>
          <b>{data.checkpoints.length}</b>チェックポイント
        </div>
        <div>
          <b>{openNotes}</b>未対応の調査メモ
        </div>
      </div>

      <section className="panel">
        <h2>
          検査の結果 <button type="button" className="link" onClick={reload}>読み込み直す</button>
        </h2>
        {data.issues.length === 0 && <p>問題はありません。</p>}
        {fatal.length > 0 && (
          <>
            <p className="issue-fatal">
              <b>直す必要がある問題（{fatal.length}件）</b>
            </p>
            <ul>
              {fatal.map((i, k) => (
                <IssueItem key={k} issue={i} data={data} onShow={showNode} />
              ))}
            </ul>
          </>
        )}
        {warnings.length > 0 && (
          <>
            <p>
              <b>注意（{warnings.length}件）</b>
              <span className="hint">　保存はできていますが、来校者の案内に影響するかもしれません</span>
            </p>
            <ul>
              {warnings.map((i, k) => (
                <IssueItem key={k} issue={i} data={data} onShow={showNode} />
              ))}
            </ul>
          </>
        )}
      </section>

      {mismatches.length > 0 && (
        <section className="panel">
          <h2>位置と棟が合っていないノード（{mismatches.length}個）</h2>
          <p className="hint">
            屋外で置いてから棟の中へ動かした、などで、置いてある位置と「棟」の設定が食い違っています。
            ボタンを押すと、位置に合わせて棟の設定を直します（位置は動きません）。
          </p>
          <ul>
            {mismatches.map((m) => (
              <li key={m.node.id}>
                {m.node.id}（{m.node.landmark ?? '目印なし'}・{m.node.floor}階）: {m.node.building ? `棟 ${m.node.building}` : '屋外'} →{' '}
                <b>{m.suggested ? `棟 ${m.suggested.id}（${m.suggested.name}）` : '屋外'}</b>
                <button type="button" className="issue-jump" onClick={() => showNode(m.node.id)}>
                  地図で見る
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="primary" disabled={fixing} onClick={fixBuildings}>
            {fixing ? '直しています…' : '位置から棟を直す'}
          </button>
        </section>
      )}

      <section className="panel">
        <h2>使い方</h2>
        <ul className="hint" style={{ fontSize: 14 }}>
          <li>
            <b>現地調査メモ</b>（スマートフォン向け）: 現地で地図をタップして、出入口・通れない場所・目印などを記録します
          </li>
          <li>
            <b>地図エディタ</b>（Chromebook 向け）: ノードを置き、辺でつなぎます。担当の棟だけを編集してください
          </li>
          <li>
            <b>部屋</b>: 目的地になる部屋を登録し、入口のノードを選びます
          </li>
          <li>保存した内容は、すぐに来校者向けの画面に反映されます（事務室から経路がつながった部屋だけが表示されます）</li>
        </ul>
      </section>
    </div>
  )
}
