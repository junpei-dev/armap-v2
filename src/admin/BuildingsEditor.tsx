import { useState } from 'react'
import CampusMap from '../components/CampusMap.tsx'
import type { Building } from '../types.ts'
import { useAdmin } from './AdminContext.tsx'

// 棟の名前の編集（2026-11-16 追加）
// ・来校者向けの名前: 目的地の一覧や「○○棟・2階」の表示に使う
// ・地図に出す短い名前: 地図の棟の上に書く（空なら棟番号）。棟は細長いので、4〜6文字までが読みやすい
// 外形・階数・向きは図面から取り込んだ値なので、ここでは変えない

export default function BuildingsEditor() {
  const { data, saveAndReload } = useAdmin()
  const [editing, setEditing] = useState<Building | null>(null)
  const [saving, setSaving] = useState(false)
  const sorted = [...data.buildings].sort((a, b) => a.id.localeCompare(b.id, 'ja', { numeric: true }))

  async function submit() {
    if (!editing) return
    setSaving(true)
    const value: Building = { ...editing, name: editing.name.trim(), shortName: editing.shortName?.trim() || undefined }
    const r = await saveAndReload('buildings', 'update', value, `棟 ${editing.id} の名前を保存しました`)
    setSaving(false)
    if (r.ok) setEditing(null)
  }

  return (
    <div className="split">
      <div style={{ display: 'grid', gap: 12 }}>
        <CampusMap buildings={data.buildings} focus={editing?.id} highlight={editing ? [editing.id] : []} height="min(52vh, 460px)" />
        <section className="panel">
          <h2>棟の一覧（{data.buildings.length}棟）</h2>
          <p className="hint">行を選ぶと名前を直せます。地図の文字は、保存するとすぐ来校者向けの画面にも出ます。</p>
          <div style={{ overflowX: 'auto' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>番号</th>
                  <th>来校者向けの名前</th>
                  <th>地図に出す短い名前</th>
                  <th>図面上の名前</th>
                  <th>階数</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((b) => (
                  <tr key={b.id} className={editing?.id === b.id ? 'selected' : ''} onClick={() => setEditing(b)}>
                    <td>{b.id}</td>
                    <td>{b.name}</td>
                    <td>{b.shortName ?? <span className="hint">（番号を表示）</span>}</td>
                    <td className="hint">{b.drawingName}</td>
                    <td>{b.floors}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="panel">
        <h2>{editing ? `棟 ${editing.id} の名前` : '棟の名前'}</h2>
        {!editing ? (
          <p className="hint">左の一覧から棟を選んでください。</p>
        ) : (
          <div className="form">
            <label>
              来校者向けの名前
              <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </label>
            <label>
              地図に出す短い名前（空なら棟番号）
              <input
                value={editing.shortName ?? ''}
                maxLength={10}
                placeholder="例: 機械"
                onChange={(e) => setEditing({ ...editing, shortName: e.target.value })}
              />
            </label>
            <p className="hint">棟は細長いので、4〜6文字までが読みやすいです。同じ科の棟が複数あるときは「機械1」「機械2」のように区別します。</p>
            <div className="buttons">
              <button type="button" className="primary" disabled={saving || !editing.name.trim()} onClick={submit}>
                {saving ? '保存中…' : '保存'}
              </button>
              <button type="button" className="secondary" onClick={() => setEditing(null)}>
                やめる
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
