import { useAdmin } from './AdminContext.tsx'

// 管理トップ：データの件数と、検査で見つかった問題の一覧（設計書 7.4）
export default function TopPage() {
  const { data, reload } = useAdmin()
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
                <li key={k} className="issue-fatal">
                  {i.target}: {i.message}
                </li>
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
                <li key={k}>
                  {i.target}: {i.message}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

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
