import jsQR from 'jsqr'
import { useEffect, useRef, useState } from 'react'
import { arrowRotation, checkpointFromQr, type Confidence } from '../core/heading.ts'
import { cssMatrix3d } from '../core/homography.ts'
import type { Step } from '../core/route.ts'
import { cameraMessage, useCamera } from '../hooks/useCamera.ts'
import type { Point } from '../types.ts'

// ④ カメラ案内（AR・要件 F-30〜F-34・F-40〜F-43、設計書 8.1・8.2）
// 「QRを読む画面」と「矢印を見る画面」を1つにまとめた画面。カメラを開いたまま、次の流れが自動で進む
//   1. 映像の中のQRコードをいつも探している（ボタンを押して読み取り画面へ移る必要はない）
//   2. QRが映ったら、現在地と向きの基準を合わせ、QRの貼られた壁の上に進む方向の矢印を出す（マーカーAR）
//   3. QRから目を離すと、前方の床に置いたような矢印に切り替わり、体の向きに合わせて回る（センサー）
// 向きが分からない間（まだQRを映していない）は矢印を出さず、QRを映すよう案内する

type Quad = [Point, Point, Point, Point]

type Props = {
  step: Step
  stepIndex: number
  stepCount: number
  targetBearing: number | null // 進む方向（図面角度）
  userHeading: number | null // 利用者の向き（図面角度）。基準合わせ前は null
  confidence: Confidence
  isLast: boolean
  /** QRを見つけた。現在地と向きを合わせ、移った先の区間の番号を返す（登録の無いQRなら null） */
  onFound: (cp: string) => number | null
  /** その地点から進む向き（壁を見て立った人から見た角度。0=前・90=右・-90=左・180=後ろ）。無ければ null */
  arrowFor: (cp: string) => number | null
  onNext: () => void
  onPrev: () => void
  onClose: () => void
}

const ARROW_SIZE = 300 // 壁の矢印の要素の大きさ（px）。QRの周りに QR 1個分ずつ余白を足した範囲を描く
const LOST_MS = 800 // これだけQRが映らなければ「目を離した」とみなし、床の矢印に切り替える
const REANCHOR_MS = 2000 // 同じQRでも、これだけ離れてからもう一度正面で映したら、向きを合わせ直す

type Marker = { cp: string; angle: number | null; step: number; quad: Quad; lost: boolean }

export default function CameraOverlay(props: Props) {
  const { step, stepIndex, stepCount, targetBearing, userHeading, confidence, isLast, onNext, onPrev, onClose } = props
  const videoRef = useRef<HTMLVideoElement>(null)
  const camera = useCamera(videoRef)
  const [marker, setMarker] = useState<Marker | null>(null)
  const [wrongQr, setWrongQr] = useState(false)
  // 親から渡される関数は、描き直しのたびに変わることがある。読み取りをやり直さないよう ref で持つ
  const handlers = useRef({ onFound: props.onFound, arrowFor: props.arrowFor })
  useEffect(() => {
    handlers.current = { onFound: props.onFound, arrowFor: props.arrowFor }
  })

  useEffect(() => {
    if (camera !== 'ready') return
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    let timer = 0
    let stopped = false
    let tracked: string | null = null // いま追いかけているQR
    let seenAt = 0
    let lost = false

    const scan = () => {
      const video = videoRef.current
      if (stopped || !video || !ctx) return
      if (video.videoWidth > 0) {
        // 処理を軽くするため、横640ピクセルまで縮めて読む
        const down = Math.min(1, 640 / video.videoWidth)
        canvas.width = Math.round(video.videoWidth * down)
        canvas.height = Math.round(video.videoHeight * down)
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })
        const cp = code ? checkpointFromQr(code.data) : null
        const now = Date.now()
        if (code) setWrongQr(!cp)

        if (code && cp) {
          // 映像の座標（縮めた分を戻す）→ 画面の座標（object-fit: cover の拡大・切り取りを考える）
          const r = video.getBoundingClientRect()
          const s = Math.max(r.width / video.videoWidth, r.height / video.videoHeight)
          const ox = (r.width - video.videoWidth * s) / 2
          const oy = (r.height - video.videoHeight * s) / 2
          const toScreen = (p: { x: number; y: number }): Point => ({ x: (p.x / down) * s + ox, y: (p.y / down) * s + oy })
          const l = code.location
          const quad: Quad = [
            toScreen(l.topLeftCorner),
            toScreen(l.topRightCorner),
            toScreen(l.bottomRightCorner),
            toScreen(l.bottomLeftCorner),
          ]
          // 新しいQR、または同じQRをしばらくぶりに正面から映した → 現在地と向きを合わせる
          const again = cp === tracked && lost && now - seenAt > REANCHOR_MS && isFrontal(quad)
          if (cp !== tracked || again) {
            const jumped = handlers.current.onFound(cp)
            if (jumped !== null) {
              tracked = cp
              navigator.vibrate?.(60)
              const angle = handlers.current.arrowFor(cp)
              setMarker({ cp, angle, step: jumped, quad, lost: false })
            }
          }
          if (cp === tracked) {
            seenAt = now
            lost = false
            setMarker((m) => (m ? { ...m, quad, lost: false } : m))
          }
        } else if (tracked && !lost && now - seenAt > LOST_MS) {
          lost = true
          setMarker((m) => (m ? { ...m, lost: true } : m))
        }
      }
      // QRを追いかけている間は、なめらかに動かすため少し速く読む
      timer = window.setTimeout(scan, tracked && !lost ? 60 : 150)
    }
    scan()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [camera])

  const message = cameraMessage(camera)
  const hasHeading = confidence !== 'none' && userHeading !== null && targetBearing !== null
  // 壁の矢印は「QRを読んだ区間」にいる間だけ。「次へ」で先へ進んだら、もうその向きではない
  const wall = marker && marker.angle !== null && marker.step === stepIndex ? marker : null
  // どの矢印を出すか: QRが映っている間は壁の矢印。目を離したら床の矢印（センサーが使えないときは壁の矢印を薄く残す）
  const mode: 'wall' | 'floor' | 'none' = message ? 'none' : wall && (!wall.lost || !hasHeading) ? 'wall' : hasHeading ? 'floor' : 'none'
  const rotation = hasHeading ? arrowRotation(userHeading, targetBearing) : 0

  let status = 'QRコードを映すと矢印が出ます'
  let statusClass = ''
  if (mode === 'wall' && wall) {
    status = wall.lost ? 'QRコードを映すと矢印が動きます' : 'QRコードで向きを合わせました'
    statusClass = wall.lost ? '' : 'ok'
  } else if (mode === 'floor') {
    status = confidence === 'low' ? '矢印がずれているかもしれません' : '矢印の方向へ進みます'
    statusClass = confidence === 'low' ? 'warn' : 'ok'
  }

  return (
    <div className="v-overlay" role="dialog" aria-label="カメラ案内">
      <video ref={videoRef} className="v-camera-video" playsInline muted />

      <div className="v-ar-top">
        <button type="button" className="v-chip" onClick={onClose}>
          ‹ 地図に戻る
        </button>
        {!message && <span className={`v-chip v-chip-status ${statusClass}`}>{status}</span>}
      </div>

      {message && <p className="v-ar-center">{message}</p>}

      {!message && camera === 'ready' && mode === 'none' && (
        <>
          <div className="v-scan-frame" aria-hidden />
          <p className="v-scan-hint">
            {wrongQr ? 'この校内案内のQRコードではありません' : '近くの「校内案内」のQRコードを映してください'}
            <small>矢印で進む方向を示します。読まなくても「次へ」で進めます</small>
          </p>
        </>
      )}

      {mode === 'wall' && wall && (
        <div
          className={`v-marker-arrow ${wall.lost ? 'lost' : ''}`}
          style={{ width: ARROW_SIZE, height: ARROW_SIZE, transform: cssMatrix3d(wall.quad, ARROW_SIZE, -1, 2) }}
          aria-hidden
        >
          {/* 中央の 100〜200 が QR。上＝前として、QRのすぐ外側に、進む向きへ回した矢印を描く（QRを隠さない） */}
          <svg viewBox="0 0 300 300" width={ARROW_SIZE} height={ARROW_SIZE}>
            <rect x="100" y="100" width="100" height="100" fill="none" stroke="#fff" strokeWidth="6" rx="6" />
            <g transform={`rotate(${wall.angle} 150 150)`}>
              <path
                d="M150 4 L204 56 L172 56 L172 94 L128 94 L128 56 L96 56 Z"
                fill="var(--me, #1c7ed6)"
                stroke="#fff"
                strokeWidth="6"
                strokeLinejoin="round"
              />
            </g>
          </svg>
        </div>
      )}

      {mode === 'floor' && (
        <div className={`v-ar-arrow ${confidence === 'low' ? 'low' : ''}`} aria-hidden>
          {/* 画面の上 = 利用者の正面。進む方向へ回してから、床に寝かせる */}
          <div style={{ transform: `perspective(700px) rotateX(58deg) rotate(${rotation}deg)` }}>
            <svg viewBox="-50 -60 100 120" width="200" height="240">
              <path
                d="M0 -55 L42 -8 L16 -8 L16 55 L-16 55 L-16 -8 L-42 -8 Z"
                fill="var(--me, #1c7ed6)"
                stroke="#fff"
                strokeWidth="4"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      )}

      <div className="v-overlay-bottom">
        {mode === 'wall' && wall && wall.angle !== null && <p className="v-overlay-dir">{directionText(wall.angle)}</p>}
        {mode === 'floor' && confidence === 'low' && (
          <p className="v-overlay-sub">近くのQRコードを映すと、矢印が正確になります</p>
        )}
        <div className="v-overlay-step">
          <span className="v-overlay-count">
            {stepIndex + 1} / {stepCount}
          </span>
          <p className="v-overlay-text">{step.text}</p>
        </div>
        <div className="v-ar-buttons">
          <button type="button" className="v-secondary" onClick={onPrev} disabled={stepIndex === 0}>
            戻る
          </button>
          <button type="button" className="v-primary" onClick={onNext}>
            {isLast ? '着いた' : '次へ'}
          </button>
        </div>
        <p className="v-overlay-sub">立ち止まって確認してください</p>
      </div>
    </div>
  )
}

/** QRをほぼ正面から映しているか（左右の辺の長さがほぼ同じ）。斜めから映したQRでは向きを合わせ直さない */
function isFrontal(q: Quad): boolean {
  const left = Math.hypot(q[3].x - q[0].x, q[3].y - q[0].y)
  const right = Math.hypot(q[2].x - q[1].x, q[2].y - q[1].y)
  const ratio = left / right
  return ratio > 0.85 && ratio < 1.18
}

/** 壁（QR）を見て立った人にとっての向きを言葉にする */
function directionText(angle: number): string {
  const a = Math.abs(angle)
  if (a < 30) return 'この先へ進みます'
  if (a >= 150) return '振り返って、後ろへ進みます'
  return angle > 0 ? 'QRコードを見て、右へ進みます' : 'QRコードを見て、左へ進みます'
}
