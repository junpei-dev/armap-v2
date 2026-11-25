import { useMemo, useRef, useState } from 'react'
import { adjacency, placeNodes } from '../core/campus.ts'
import { planAngle } from '../core/geometry.ts'
import { anchorOffset, averageAngles, calibratedFacing, planHeading, wallYaw } from '../core/heading.ts'
import { cameraMessage, useCamera } from '../hooks/useCamera.ts'
import { requestOrientationPermission, savedSensorStatus, type SensorStatus, useDeviceHeading } from '../hooks/useDeviceHeading.ts'
import { useQrScanner } from '../hooks/useQrScanner.ts'
import { NODE_KIND_LABELS, type PlacedNode } from '../types.ts'
import { useAdmin } from './AdminContext.tsx'

// 現地調整: QRの「掲示面の向き」を、現地でスマホを使って測り直す（2026-11-25 追加・設計書 8.6）
//
// 矢印や印が左右にずれる一番の原因は、掲示面の向き（地図から計算した値）と、実際に貼った壁の向きの差。
// 手順:
//   1. 貼ってあるQRをカメラで映す（なるべく正面から）。映している間「壁にまっすぐ向いた向き」を測る
//   2. 隣のノードを1つ選び、スマホを立てて、カメラをその方向の道（廊下）とまっすぐに向ける
//   3. 「この向きで合わせる」→ 2つの向きの差と、図面の上の道の向きから、正しい掲示面の向きを計算する
//   4. 保存すると、そのQRから先の矢印・印がすべて直る
// QRの正面に立つほど、また遠くまでまっすぐな道を選ぶほど正確になる

export default function CalibratePage() {
  const [started, setStarted] = useState(false)
  const [sensor, setSensor] = useState<SensorStatus>(savedSensorStatus)

  if (!started) {
    return (
      <section className="panel calib-intro">
        <h2>現地調整（QRの向き合わせ）</h2>
        <p>
          スマートフォンで、貼ってあるQRの前に立って使います。QRの「掲示面の向き」を測り直し、案内の矢印と印の
          <b>左右のずれ</b>を直します。
        </p>
        <ol>
          <li>貼ってあるQRを、なるべく正面からカメラで映す</li>
          <li>隣のノードを選び、スマホを立てて、カメラをその方向の道にまっすぐ向ける</li>
          <li>「この向きで合わせる」を押し、表示された値を保存する</li>
        </ol>
        {sensor === 'denied' && <p className="error-text">動きセンサーが許可されていません。ブラウザの設定で許可してから、ページを読み込み直してください。</p>}
        {sensor === 'unsupported' && <p className="error-text">この端末では動きセンサーが使えません。スマートフォンで開いてください。</p>}
        <button
          type="button"
          className="primary"
          disabled={sensor === 'unsupported'}
          onClick={async () => {
            // iPhone は、ボタンを押したときに許可を求める決まり
            const s = sensor === 'granted' ? 'granted' : await requestOrientationPermission()
            setSensor(s)
            if (s === 'granted') setStarted(true)
          }}
        >
          カメラとセンサーを使って始める
        </button>
      </section>
    )
  }
  return <Calibrator onStop={() => setStarted(false)} />
}

type Measured = { facing: number; delta: number; samples: number }

function Calibrator({ onStop }: { onStop: () => void }) {
  const { data, saveAndReload } = useAdmin()
  const videoRef = useRef<HTMLVideoElement>(null)
  const camera = useCamera(videoRef)
  const { heading, headingRef } = useDeviceHeading(true)
  const placed = useMemo(() => placeNodes(data), [data])
  const adj = useMemo(() => adjacency(data.edges), [data.edges])

  // 映したQRと、その間に集めた「壁にまっすぐ向いた向き」（端末の角度）
  const [cpId, setCpId] = useState<string | null>(null)
  const [wallList, setWallList] = useState<number[]>([])
  const [seeing, setSeeing] = useState(false)
  const [frontal, setFrontal] = useState<number | null>(null) // 斜めの角度（度）
  const [neighborId, setNeighborId] = useState<string | null>(null)
  const [measuring, setMeasuring] = useState(false)
  const [result, setResult] = useState<Measured | null>(null)
  const [saving, setSaving] = useState(false)

  useQrScanner(videoRef, camera, ({ cp, quad, focal }) => {
    if (!cp || !quad) {
      if (seeing) setSeeing(false)
      return false
    }
    const known = data.checkpoints.some((c) => c.id === cp)
    if (!known) return false
    if (cp !== cpId) {
      // 別のQRを映した: 測り直し
      setCpId(cp)
      setWallList([])
      setNeighborId(null)
      setResult(null)
      navigator.vibrate?.(60)
    }
    if (!seeing) setSeeing(true)
    const yaw = focal ? wallYaw(quad, focal) : null
    setFrontal(yaw)
    const h = headingRef.current
    // QRが小さすぎる（遠い）ときは測らない。40回分たまったら止める
    if (h !== null && yaw !== null) setWallList((l) => (l.length >= 40 ? l : [...l, h + yaw]))
    return true
  })

  const cp = data.checkpoints.find((c) => c.id === cpId) ?? null
  const node = cp ? placed.find((n) => n.id === cp.node) : undefined
  const wallHeading = averageAngles(wallList)
  // 隣のノード（階段の上下など、同じ位置のものは除く）。遠い順＝まっすぐ長い道ほど正確
  const neighbors = useMemo(() => {
    if (!node) return []
    const byId = new Map(placed.map((n) => [n.id, n]))
    return (adj.get(node.id) ?? [])
      .map((id) => byId.get(id))
      .filter((n): n is PlacedNode => !!n && n.floor === node.floor && Math.hypot(n.pos.x - node.pos.x, n.pos.y - node.pos.y) >= 1.5)
      .map((n) => ({ node: n, bearing: planAngle(node.pos, n.pos), distance: Math.hypot(n.pos.x - node.pos.x, n.pos.y - node.pos.y) }))
      .sort((a, b) => b.distance - a.distance)
  }, [node, placed, adj])
  const neighbor = neighbors.find((n) => n.node.id === neighborId) ?? null

  // いまの値（保存済みの向き）のままだと、選んだ道がどちらに見えるか（ずれの大きさの目安）
  const currentError =
    cp && wallHeading !== null && heading !== null && neighbor
      ? Math.round(((planHeading(heading, anchorOffset(cp.facing, wallHeading)) - neighbor.bearing + 540) % 360) - 180)
      : null

  /** 1秒間の向きを平均して、正しい掲示面の向きを計算する */
  async function measure() {
    if (!cp || wallHeading === null || !neighbor) return
    setMeasuring(true)
    const list: number[] = []
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 100))
      if (headingRef.current !== null) list.push(headingRef.current)
    }
    setMeasuring(false)
    const pathHeading = averageAngles(list)
    if (pathHeading === null) return
    const facing = Math.round(calibratedFacing(wallHeading, pathHeading, neighbor.bearing))
    const delta = ((facing - cp.facing + 540) % 360) - 180
    setResult({ facing, delta, samples: wallList.length })
    navigator.vibrate?.(40)
  }

  async function saveResult() {
    if (!cp || !result) return
    setSaving(true)
    const r = await saveAndReload(
      'checkpoints',
      'update',
      { ...cp, facing: result.facing },
      `${cp.id} の掲示面の向きを ${cp.facing}° → ${result.facing}° に直しました`,
    )
    setSaving(false)
    if (r.ok) setResult(null)
  }

  const message = cameraMessage(camera)
  const label = (n: PlacedNode) => n.landmark ?? `${NODE_KIND_LABELS[n.kind].label}（${n.id}）`

  return (
    <div className="calib">
      <div className="calib-camera">
        <video ref={videoRef} playsInline muted />
        {message && <p className="calib-message">{message}</p>}
        {!message && !cp && <div className="calib-frame" aria-hidden />}
        <div className="calib-status">
          {!cp
            ? 'QRを映してください'
            : seeing
              ? `${cp.id} を映しています（測った回数 ${wallList.length}）`
              : `${cp.id} を測りました（${wallList.length}回）`}
          {seeing && frontal !== null && Math.abs(frontal) > 12 && <b>　斜め {Math.round(Math.abs(frontal))}°。正面に回るとより正確です</b>}
        </div>
        {/* 選んだ道を、画面の中央の縦線に合わせる */}
        {neighbor && <div className="calib-aim" aria-hidden />}
        <button type="button" className="calib-stop" onClick={onStop}>
          終わる
        </button>
      </div>

      {cp && node && (
        <section className="panel">
          <h2>
            {cp.id}　{cp.place}
          </h2>
          <p className="hint">
            いまの掲示面の向き: <b>{cp.facing}°</b>　ノード {node.id}（{node.landmark ?? '目印なし'}・{node.floor}階）
          </p>
          {wallList.length < 5 ? (
            <p>QRをもう少し映し続けてください（近づいて大きく映すと測れます）。</p>
          ) : (
            <>
              <h3>道を1つ選び、カメラをその道にまっすぐ向けてください</h3>
              <p className="hint">スマホを立てて持ち、画面の中央の縦線を道の先（廊下の奥・通路の先）に合わせます。長くまっすぐな道ほど正確です。</p>
              <div className="calib-neighbors">
                {neighbors.map((n) => (
                  <button
                    key={n.node.id}
                    type="button"
                    className={n.node.id === neighborId ? 'on' : ''}
                    onClick={() => {
                      setNeighborId(n.node.id)
                      setResult(null)
                    }}
                  >
                    {label(n.node)}
                    <small>{Math.round(n.distance)}m 先</small>
                  </button>
                ))}
                {neighbors.length === 0 && <p className="error-text">このノードから同じ階でつながっている道がありません。地図エディタで辺を確かめてください。</p>}
              </div>
              {neighbor && (
                <div className="buttons" style={{ alignItems: 'center' }}>
                  <button type="button" className="primary" disabled={measuring} onClick={measure}>
                    {measuring ? '測っています…（動かさないで）' : 'この向きで合わせる'}
                  </button>
                  {currentError !== null && (
                    <span className="hint">いまの値では、この道が {Math.abs(currentError)}° {currentError > 0 ? '左' : '右'}にずれて見えています</span>
                  )}
                </div>
              )}
            </>
          )}
          {result && (
            <div className={`calib-result ${Math.abs(result.delta) > 45 ? 'warn' : ''}`}>
              <p>
                掲示面の向き: {cp.facing}° → <b>{result.facing}°</b>（{result.delta > 0 ? '+' : ''}
                {result.delta}°）
              </p>
              {Math.abs(result.delta) > 45 && (
                <p className="error-text">差が大きすぎます。選んだ道とカメラを向けた方向が合っているか、QRを読み直して確かめてください。</p>
              )}
              <div className="buttons">
                <button type="button" className="primary" disabled={saving} onClick={saveResult}>
                  {saving ? '保存中…' : 'この値を保存する'}
                </button>
                <button type="button" className="secondary" onClick={() => setResult(null)}>
                  やり直す
                </button>
              </div>
              <p className="hint">同じ場所で2〜3回測り、値が近ければ保存してください（5°以内なら十分です）。</p>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
