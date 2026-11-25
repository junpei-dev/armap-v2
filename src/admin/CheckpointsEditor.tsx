import QRCode from 'qrcode'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import CampusMap, { useMapScale, useUpright } from '../components/CampusMap.tsx'
import { placeNodes, START_CHECKPOINT_ID } from '../core/campus.ts'
import { suggestFacing } from '../core/route.ts'
import type { Checkpoint, PlacedNode } from '../types.ts'
import { useAdmin } from './AdminContext.tsx'

// QRチェックポイントの一覧と編集（設計書 5.2・7.4）
// CP01（事務室）は経路の出発点になるので、最初に登録する
// 2026-11-25: 貼る場所を地図のタップで選べるようにし、掲示面の向きは「事務室の方から来た人に正面」を自動で入れる。
//             掲示用のシートも、ここから印刷できるようにした（教師用PCのスクリプトは不要）
// 貼ったあとは「現地調整」タブで掲示面の向きを測り直す

const EMPTY: Checkpoint = { id: '', node: '', facing: 0, place: '' }

export default function CheckpointsEditor() {
  const { data } = useAdmin()
  const [editing, setEditing] = useState<{ cp: Checkpoint; isNew: boolean } | null>(null)
  const [showing, setShowing] = useState<Checkpoint | null>(null)
  const hasStart = data.checkpoints.some((c) => c.id === START_CHECKPOINT_ID)
  const placed = useMemo(() => placeNodes(data), [data])

  function nextId(): string {
    const ids = new Set(data.checkpoints.map((c) => c.id))
    for (let i = 1; ; i++) {
      const id = `CP${String(i).padStart(2, '0')}`
      if (!ids.has(id)) return id
    }
  }

  return (
    <div className="split">
      <div style={{ display: 'grid', gap: 12 }}>
        <section className="panel">
          <h2>
            QRを貼る場所（{data.checkpoints.length}か所）
            <button type="button" className="link" onClick={() => setEditing({ cp: { ...EMPTY, id: nextId() }, isNew: true })}>
              ＋ 貼る場所を追加
            </button>
          </h2>
          {!hasStart && (
            <p className="error-text">
              事務室のQR（{START_CHECKPOINT_ID}）が未登録です。これが案内の出発点になるので、最初に登録してください。
            </p>
          )}
          <p className="hint">行を押すと、場所・向きを直せます。「QR・印刷」で掲示用のシートを印刷できます。</p>
          <div style={{ overflowX: 'auto' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>貼る場所</th>
                  <th>ノード</th>
                  <th>掲示面の向き</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.checkpoints.map((c) => {
                  const node = placed.find((n) => n.id === c.node)
                  return (
                    <tr key={c.id} className={editing?.cp.id === c.id ? 'selected' : ''} onClick={() => setEditing({ cp: c, isNew: false })}>
                      <td>{c.id}</td>
                      <td>{c.place}</td>
                      <td className="hint">
                        {node?.landmark ?? c.node}
                        {node ? `・${node.floor}階` : '（ノードが見つかりません）'}
                      </td>
                      <td>{c.facing}°</td>
                      <td>
                        <button
                          type="button"
                          className="secondary"
                          onClick={(e) => {
                            e.stopPropagation()
                            setShowing(c)
                          }}
                        >
                          QR・印刷
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
        <CheckpointsMap placed={placed} selectedId={editing?.cp.id ?? null} />
      </div>
      {showing && <QrDialog cp={showing} onClose={() => setShowing(null)} />}
      {editing && (
        <CheckpointForm key={editing.cp.id} initial={editing.cp} isNew={editing.isNew} placed={placed} onDone={() => setEditing(null)} />
      )}
    </div>
  )
}

/** 全部のQRの場所を地図に出す（選んでいるものは大きく） */
function CheckpointsMap({ placed, selectedId }: { placed: PlacedNode[]; selectedId: string | null }) {
  const { data } = useAdmin()
  return (
    <CampusMap buildings={data.buildings} height="min(46vh, 420px)">
      <CpMarks
        marks={data.checkpoints.flatMap((c) => {
          const n = placed.find((p) => p.id === c.node)
          return n ? [{ id: c.id, pos: n.pos, facing: c.facing, on: c.id === selectedId }] : []
        })}
      />
    </CampusMap>
  )
}

/** QRの印: 四角と、掲示面の向き（QRの面が向いている方）の短い線 */
function CpMarks({ marks }: { marks: { id: string; pos: { x: number; y: number }; facing: number; on: boolean }[] }) {
  const px = useMapScale()
  const upright = useUpright()
  return (
    <g style={{ pointerEvents: 'none' }}>
      {marks.map((m) => {
        const s = (m.on ? 9 : 6) * px
        const t = (m.facing * Math.PI) / 180
        const len = (m.on ? 22 : 14) * px
        return (
          <g key={m.id}>
            <line
              x1={m.pos.x}
              y1={m.pos.y}
              x2={m.pos.x + Math.sin(t) * len}
              y2={m.pos.y - Math.cos(t) * len}
              stroke="#1c7ed6"
              strokeWidth={3 * px}
              strokeLinecap="round"
            />
            <rect x={m.pos.x - s} y={m.pos.y - s} width={s * 2} height={s * 2} rx={2 * px} fill={m.on ? '#d9480f' : '#1c7ed6'} stroke="#fff" strokeWidth={1.5 * px} />
            <text
              x={m.pos.x}
              y={m.pos.y - s - 4 * px}
              fontSize={(m.on ? 12 : 10) * px}
              fontWeight="bold"
              textAnchor="middle"
              fill="#1b1d1a"
              transform={upright(m.pos)}
              style={{ paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3 * px }}
            >
              {m.id}
            </text>
          </g>
        )
      })}
    </g>
  )
}

function CheckpointForm({
  initial,
  isNew,
  placed,
  onDone,
}: {
  initial: Checkpoint
  isNew: boolean
  placed: PlacedNode[]
  onDone: () => void
}) {
  const { data, saveAndReload } = useAdmin()
  const [v, setV] = useState<Checkpoint>(initial)
  const [saving, setSaving] = useState(false)
  const current = placed.find((n) => n.id === v.node)
  const [floor, setFloor] = useState(current?.floor ?? 1)
  // 地図は、開いたときの場所の棟まで拡大する（選び直すたびに動かないよう、最初の値だけ使う）
  const [initialBuilding] = useState(current?.building)
  const maxFloor = Math.max(1, ...data.buildings.map((b) => b.floors))
  const start = data.checkpoints.find((c) => c.id === START_CHECKPOINT_ID)?.node ?? null
  const suggested = v.node && start ? suggestFacing(placed, data.edges, start, v.node) : null

  /** 地図で場所を選んだ: ノードを決め、説明が空なら目印の名前を入れ、新しく作るときは向きもおすすめにする */
  function choose(n: PlacedNode) {
    const f = start ? suggestFacing(placed, data.edges, start, n.id) : null
    setV((old) => ({
      ...old,
      node: n.id,
      place: old.place || (n.landmark ? `${n.landmark}の前` : ''),
      facing: isNew && f !== null ? f : old.facing,
    }))
  }

  async function submit() {
    setSaving(true)
    const r = await saveAndReload('checkpoints', isNew ? 'insert' : 'update', v, `QR ${v.id}（${v.place}）を保存しました`)
    setSaving(false)
    if (r.ok) onDone()
  }

  // 選べる場所: その階のノード（目印の名前があるものを先に）
  const onFloor = placed.filter((n) => n.floor === floor)
  const named = [...placed].sort((a, b) => Number(!a.landmark) - Number(!b.landmark) || (a.landmark ?? a.id).localeCompare(b.landmark ?? b.id, 'ja'))

  return (
    <section className="panel">
      <h2>{isNew ? `新しいQR（${v.id}）` : `QR ${v.id}`}</h2>
      <div className="form">
        {isNew && (
          <label>
            ID（{START_CHECKPOINT_ID} は事務室。ふつうはこのままでよい）
            <input value={v.id} onChange={(e) => setV({ ...v, id: e.target.value.trim().toUpperCase() })} />
          </label>
        )}

        <div>
          <b style={{ fontSize: 14 }}>① 貼る場所を地図で選ぶ</b>
          <p className="hint" style={{ margin: '2px 0 6px' }}>
            QRを貼る壁に一番近いノード（点）を押します。点は地図エディタで置いたものです。
          </p>
          <div className="toolbar">
            <span className="seg">
              {Array.from({ length: maxFloor }, (_, i) => i + 1).map((f) => (
                <button key={f} type="button" className={f === floor ? 'on' : ''} onClick={() => setFloor(f)}>
                  {f}階
                </button>
              ))}
            </span>
          </div>
          <CampusMap
            buildings={data.buildings}
            height="min(42vh, 360px)"
            zoomTo={initialBuilding}
            onTap={(p) => {
              // 押した所から 5m 以内で一番近いノード
              let best: PlacedNode | null = null
              let bestD = 5
              for (const n of onFloor) {
                const d = Math.hypot(n.pos.x - p.x, n.pos.y - p.y)
                if (d < bestD) {
                  best = n
                  bestD = d
                }
              }
              if (best) choose(best)
            }}
          >
            <PickNodes nodes={onFloor} selected={v.node} />
          </CampusMap>
          <label style={{ marginTop: 6 }}>
            または名前から選ぶ
            <select
              value={v.node}
              onChange={(e) => {
                const n = placed.find((p) => p.id === e.target.value)
                if (n) {
                  setFloor(n.floor)
                  choose(n)
                }
              }}
            >
              <option value="">（選んでください）</option>
              {named.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.landmark ?? '（目印なし）'}　{n.building ? `${n.building}棟` : '屋外'}・{n.floor}階　{n.id}
                </option>
              ))}
            </select>
          </label>
          {current && (
            <p className="hint">
              選んだ場所: <b>{current.landmark ?? '（目印なし）'}</b>（{current.building ? `${current.building}棟` : '屋外'}・{current.floor}階・{current.id}）
            </p>
          )}
        </div>

        <label>
          ② 貼る場所の説明（掲示する人・来校者の両方が分かるように）
          <input value={v.place} onChange={(e) => setV({ ...v, place: e.target.value })} placeholder="例: 情報技術科職員室の入口の横" />
        </label>

        <div>
          <label>
            ③ 掲示面の向き（度）
            <input type="number" min={0} max={359} value={v.facing} onChange={(e) => setV({ ...v, facing: Number(e.target.value) })} />
          </label>
          <p className="hint">
            QRの面が地図の上でどちらを向くか（上=0・右=90・下=180・左=270。地図の青い線の向き）。
            {suggested !== null && (
              <>
                {' '}
                事務室の方から来た人の正面になる向きは <b>{suggested}°</b>
                {suggested !== v.facing && (
                  <button type="button" className="issue-jump" onClick={() => setV({ ...v, facing: suggested })}>
                    {suggested}° にする
                  </button>
                )}
              </>
            )}
            <br />
            <b>貼ったあとに「現地調整」タブで測り直すと、正確な値になります。</b>
          </p>
        </div>

        <div className="buttons">
          <button type="button" className="primary" onClick={submit} disabled={saving || !v.node || !v.place}>
            {saving ? '保存中…' : isNew ? '追加する' : '保存する'}
          </button>
          <button type="button" className="secondary" onClick={onDone}>
            閉じる
          </button>
          {!isNew && v.id !== START_CHECKPOINT_ID && (
            <button
              type="button"
              className="danger"
              onClick={async () => {
                if (confirm(`QR ${v.id}（${v.place}）を削除しますか？\n貼ってあるQRもはがしてください（読んでも「登録されていません」と出ます）。`)) {
                  const r = await saveAndReload('checkpoints', 'delete', v.id, `QR ${v.id} を削除しました`)
                  if (r.ok) onDone()
                }
              }}
            >
              削除
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

/** 場所を選ぶ地図の点（目印の名前があるものは少し大きく、選んだものはオレンジ） */
function PickNodes({ nodes, selected }: { nodes: PlacedNode[]; selected: string }) {
  const px = useMapScale()
  const upright = useUpright()
  return (
    <g style={{ pointerEvents: 'none' }}>
      {nodes.map((n) => {
        const on = n.id === selected
        const r = (on ? 8 : n.landmark ? 5 : 3.5) * px
        return (
          <g key={n.id}>
            <circle cx={n.pos.x} cy={n.pos.y} r={r} fill={on ? '#d9480f' : n.landmark ? '#1f6b3a' : '#9aa597'} stroke="#fff" strokeWidth={1.2 * px} />
            {on && n.landmark && (
              <text
                x={n.pos.x}
                y={n.pos.y - r - 4 * px}
                fontSize={12 * px}
                fontWeight="bold"
                textAnchor="middle"
                transform={upright(n.pos)}
                style={{ paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3 * px }}
              >
                {n.landmark}
              </text>
            )}
          </g>
        )
      })}
    </g>
  )
}

/**
 * QRを画面に大きく表示し、掲示用のシート（A4）を印刷できるようにする
 * 中身は掲示用と同じURL（このサイトの /?cp=CP01）。スマホの標準カメラで読むとアプリが開く
 */
function QrDialog({ cp, onClose }: { cp: Checkpoint; onClose: () => void }) {
  const url = `${window.location.origin}/?cp=${cp.id}`
  const [img, setImg] = useState<string | null>(null)

  useEffect(() => {
    QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 4, width: 1200 }).then(setImg, () => setImg(null))
  }, [url])

  // Esc キーで閉じる
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="qr-backdrop" role="dialog" aria-label={`${cp.id} のQRコード`} onClick={onClose}>
      <div className="qr-dialog" onClick={(e) => e.stopPropagation()}>
        <h2>
          {cp.id}　{cp.place}
        </h2>
        {img ? <img src={img} alt={`${cp.id} のQRコード`} className="qr-image" /> : <p>作成中…</p>}
        <p className="hint">{url}</p>
        <div className="buttons">
          <button type="button" className="primary" disabled={!img} onClick={() => window.print()}>
            掲示用に印刷する（A4）
          </button>
          <button type="button" className="secondary" onClick={onClose}>
            閉じる
          </button>
        </div>
        <p className="hint">印刷したら、QRの面を掲示面の向き（{cp.facing}°）に向けて目の高さに貼り、「現地調整」タブで向きを測り直してください。</p>
      </div>
      {/* 印刷するときだけ出る、掲示用のシート */}
      {img &&
        createPortal(
          <div className="qr-print">
            <div className="qr-print-school">宮崎県立延岡工業高等学校</div>
            <div className="qr-print-title">校内案内</div>
            <img src={img} alt="" />
            <div className="qr-print-lead">スマートフォンのカメラで読み取ってください</div>
            <div className="qr-print-sub">ここから目的の部屋までの道順を案内します</div>
            <div className="qr-print-id">
              {cp.id}　{cp.place}
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
