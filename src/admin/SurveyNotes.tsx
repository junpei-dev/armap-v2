import { useMemo, useState } from 'react'
import CampusMap, { useMapScale } from '../components/CampusMap.tsx'
import { pointInPolygon } from '../core/geometry.ts'
import { type Point, SURVEY_KIND_LABELS, SURVEY_KINDS, type SurveyKind, type SurveyNote } from '../types.ts'
import { useAdmin } from './AdminContext.tsx'

// 現地調査メモ（要件 F-58・スマートフォン向け）
// 地図で今いる場所をタップ → 種類を選ぶ → メモを書いて保存

export default function SurveyNotes() {
  const { data, saveAndReload } = useAdmin()
  const [draft, setDraft] = useState<Point | null>(null)
  const [kind, setKind] = useState<SurveyKind>('entrance')
  const [floor, setFloor] = useState(1)
  const [text, setText] = useState('')
  const [showDone, setShowDone] = useState(false)
  const [saving, setSaving] = useState(false)

  // タップした場所がどの棟の中か（屋外なら undefined）
  const buildingAtDraft = useMemo(
    () => (draft ? data.buildings.find((b) => pointInPolygon(draft, b.outline)) : undefined),
    [draft, data.buildings],
  )
  const maxFloor = buildingAtDraft?.floors ?? 1

  async function submit() {
    if (!draft) return
    setSaving(true)
    const note: SurveyNote = {
      pos: { x: Math.round(draft.x * 100) / 100, y: Math.round(draft.y * 100) / 100 },
      floor: buildingAtDraft ? Math.min(floor, maxFloor) : 1,
      building: buildingAtDraft?.id,
      kind,
      text,
      resolved: false,
    }
    const r = await saveAndReload('survey', 'insert', note, 'メモを保存しました')
    setSaving(false)
    if (r.ok) {
      setDraft(null)
      setText('')
    }
  }

  const notes = data.survey.filter((s) => showDone || !s.resolved)

  return (
    <div className="split">
      <div>
        <p className="hint">今いる場所を地図でタップしてください。2本指で拡大できます。</p>
        <CampusMap buildings={data.buildings} onTap={setDraft} focus={buildingAtDraft?.id}>
          {data.survey.map((s) => (
            <NoteMark key={s.id} note={s} />
          ))}
          {draft && <DraftMark p={draft} />}
        </CampusMap>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        <section className="panel">
          <h2>メモを残す</h2>
          {!draft ? (
            <p className="hint">まず地図で場所をタップしてください。</p>
          ) : (
            <div className="form">
              <p className="hint">
                場所: {buildingAtDraft ? `${buildingAtDraft.name}（${buildingAtDraft.id}）の中` : '屋外'}
              </p>
              {buildingAtDraft && maxFloor > 1 && (
                <label>
                  階
                  <select value={Math.min(floor, maxFloor)} onChange={(e) => setFloor(Number(e.target.value))}>
                    {Array.from({ length: maxFloor }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {i + 1}階
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="chips" role="radiogroup" aria-label="メモの種類">
                {SURVEY_KINDS.map((k) => (
                  <button key={k} type="button" className={k === kind ? 'on' : ''} onClick={() => setKind(k)}>
                    {SURVEY_KIND_LABELS[k]}
                  </button>
                ))}
              </div>
              <label>
                メモ
                <textarea
                  rows={3}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="例: 北側の出入口。ふだんは開いている。写真2枚目"
                />
              </label>
              <div className="buttons">
                <button type="button" className="primary" onClick={submit} disabled={saving}>
                  {saving ? '保存中…' : '保存する'}
                </button>
                <button type="button" className="secondary" onClick={() => setDraft(null)}>
                  やめる
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="panel">
          <h2>
            記録したメモ（{notes.length}件）{' '}
            <label className="hint" style={{ fontWeight: 'normal' }}>
              <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> 対応済みも表示
            </label>
          </h2>
          <ul className="list">
            {notes.map((s) => (
              <li key={s.id} className={s.resolved ? 'done' : ''}>
                <b>{SURVEY_KIND_LABELS[s.kind]}</b>{' '}
                {s.building ? `${s.building}棟 ${s.floor}階` : '屋外'}
                <div>{s.text || '（メモなし）'}</div>
                <div className="meta">
                  {s.createdBy?.split('@')[0]} {formatTime(s.createdAt)}
                </div>
                <div className="buttons" style={{ marginTop: 6 }}>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      saveAndReload(
                        'survey',
                        'update',
                        { ...s, resolved: !s.resolved },
                        s.resolved ? '未対応に戻しました' : '対応済みにしました',
                      )
                    }
                  >
                    {s.resolved ? '未対応に戻す' : '対応済みにする'}
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => {
                      if (confirm('このメモを削除しますか？')) saveAndReload('survey', 'delete', s.id, 'メモを削除しました')
                    }}
                  >
                    削除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}

/** 記録済みのメモの印（三角形） */
export function NoteMark({ note }: { note: SurveyNote }) {
  const px = useMapScale()
  const s = 7 * px
  const { x, y } = note.pos
  return (
    <polygon
      points={`${x},${y - s} ${x - s},${y + s * 0.8} ${x + s},${y + s * 0.8}`}
      fill="var(--survey)"
      opacity={note.resolved ? 0.3 : 0.9}
      stroke="#fff"
      strokeWidth={1 * px}
    >
      <title>
        {SURVEY_KIND_LABELS[note.kind]}: {note.text}
      </title>
    </polygon>
  )
}

/** これから保存する場所の印 */
function DraftMark({ p }: { p: Point }) {
  const px = useMapScale()
  return (
    <g>
      <circle cx={p.x} cy={p.y} r={10 * px} fill="none" stroke="var(--selected)" strokeWidth={2 * px} />
      <circle cx={p.x} cy={p.y} r={2.5 * px} fill="var(--selected)" />
    </g>
  )
}

/** データベースの時刻（世界標準時 "YYYY-MM-DD HH:MM:SS"）を日本時間で表示する */
function formatTime(utc?: string): string {
  if (!utc) return ''
  const d = new Date(utc.replace(' ', 'T') + 'Z')
  return Number.isNaN(d.getTime()) ? utc : d.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
}
