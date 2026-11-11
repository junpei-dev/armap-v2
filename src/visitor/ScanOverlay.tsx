import jsQR from 'jsqr'
import { useEffect, useRef, useState } from 'react'
import { checkpointFromQr } from '../core/heading.ts'
import { cssMatrix3d } from '../core/homography.ts'
import { cameraMessage, useCamera } from '../hooks/useCamera.ts'
import type { Point } from '../types.ts'

// ⑤ QR読み取り（要件 F-30〜F-34）と、QRを基準にした矢印（マーカーAR・要件 F-43、設計書 8.2）
// ・背面カメラの映像から jsQR でQRコードを探す。見つけたら onFound でチェックポイントIDを知らせる
// ・arrowFor がその地点で進む向きを返したら、すぐには閉じずにQRを追いかけ続け、
//   QRの貼られた壁の上に矢印を重ねる（QRの四隅 → 射影変換 → CSS の matrix3d）
// ・壁の上の矢印の向き: 上＝前、右＝右、左＝左、下＝後ろ（壁を見て立っている人から見て）

type Props = {
  onFound: (cp: string) => void
  onClose: () => void
  /** その地点から進む向き（壁を見て立った人から見た角度。0=前・90=右・-90=左・180=後ろ）。無ければ null */
  arrowFor?: (cp: string) => number | null
}

const ARROW_SIZE = 300 // 矢印の要素の大きさ（px）。QRの周りに QR 1個分ずつ余白を足した範囲を描く

export default function ScanOverlay({ onFound, onClose, arrowFor }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const camera = useCamera(videoRef)
  const [hint, setHint] = useState('QRコードを枠の中に映してください')
  // 見つけたQR（矢印を出す場合）: 進む向きと、画面上のQRの四隅
  const [marker, setMarker] = useState<{ angle: number; quad: [Point, Point, Point, Point] | null; lost: boolean } | null>(null)
  // 親から渡される関数は、描き直しのたびに変わることがある。読み取りをやり直さないよう ref で持つ
  const handlers = useRef({ onFound, onClose, arrowFor })
  useEffect(() => {
    handlers.current = { onFound, onClose, arrowFor }
  })

  useEffect(() => {
    if (camera !== 'ready') return
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    let timer = 0
    let stopped = false
    let found: string | null = null
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
        if (code && !cp) setHint('この校内案内のQRコードではありません')

        if (cp && !found) {
          // はじめて見つけた
          found = cp
          navigator.vibrate?.(60)
          handlers.current.onFound(cp)
          const angle = handlers.current.arrowFor?.(cp) ?? null
          if (angle === null) {
            stopped = true
            handlers.current.onClose()
            return
          }
          setMarker({ angle, quad: null, lost: false })
        }
        if (cp && cp === found && code) {
          // 映像の座標（縮めた分を戻す）→ 画面の座標（object-fit: cover の拡大・切り取りを考える）
          const r = video.getBoundingClientRect()
          const s = Math.max(r.width / video.videoWidth, r.height / video.videoHeight)
          const ox = (r.width - video.videoWidth * s) / 2
          const oy = (r.height - video.videoHeight * s) / 2
          const toScreen = (p: { x: number; y: number }): Point => ({ x: (p.x / down) * s + ox, y: (p.y / down) * s + oy })
          const l = code.location
          const quad: [Point, Point, Point, Point] = [
            toScreen(l.topLeftCorner),
            toScreen(l.topRightCorner),
            toScreen(l.bottomRightCorner),
            toScreen(l.bottomLeftCorner),
          ]
          seenAt = Date.now()
          lost = false
          setMarker((m) => (m ? { ...m, quad, lost: false } : m))
        } else if (found && !lost && seenAt > 0 && Date.now() - seenAt > 800) {
          // QRが映らなくなったら、矢印を薄くする（最後の位置に残す）
          lost = true
          setMarker((m) => (m ? { ...m, lost: true } : m))
        }
      }
      // 矢印を出している間はなめらかに追いかけるため少し速く読む
      timer = window.setTimeout(scan, found ? 60 : 150)
    }
    scan()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [camera])

  const message = cameraMessage(camera)

  return (
    <div className="v-overlay" role="dialog" aria-label="QRコードを読む">
      <video ref={videoRef} className="v-camera-video" playsInline muted />
      {!marker && <div className="v-scan-frame" aria-hidden />}

      {marker?.quad && (
        <div
          className={`v-marker-arrow ${marker.lost ? 'lost' : ''}`}
          style={{ width: ARROW_SIZE, height: ARROW_SIZE, transform: cssMatrix3d(marker.quad, ARROW_SIZE, -1, 2) }}
          aria-hidden
        >
          {/* 中央の 100〜200 が QR。上＝前として、QRのすぐ外側に、進む向きへ回した矢印を描く（QRを隠さない） */}
          <svg viewBox="0 0 300 300" width={ARROW_SIZE} height={ARROW_SIZE}>
            <rect x="100" y="100" width="100" height="100" fill="none" stroke="#fff" strokeWidth="6" rx="6" />
            <g transform={`rotate(${marker.angle} 150 150)`}>
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

      <div className="v-overlay-bottom">
        {marker ? (
          <>
            <p className="v-overlay-text">{directionText(marker.angle)}</p>
            <p className="v-overlay-sub">
              {marker.quad ? 'QRコードの上に、進む方向を表示しています' : 'QRコードを映すと、その上に進む方向を表示します'}
            </p>
            <button type="button" className="v-primary" onClick={onClose}>
              案内に戻る
            </button>
          </>
        ) : (
          <>
            <p className="v-overlay-text">{message ?? (camera === 'starting' ? 'カメラを準備しています…' : hint)}</p>
            <p className="v-overlay-sub">QRコードの正面に立って読むと、矢印の向きが正確になります</p>
            <button type="button" className="v-secondary" onClick={onClose}>
              閉じる
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/** 壁（QR）を見て立った人にとっての向きを言葉にする */
function directionText(angle: number): string {
  const a = Math.abs(angle)
  if (a < 30) return 'この先へ進みます'
  if (a >= 150) return '振り返って、後ろへ進みます'
  return angle > 0 ? 'QRコードを見て、右へ進みます' : 'QRコードを見て、左へ進みます'
}
