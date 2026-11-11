import { useRef } from 'react'
import { arrowRotation, type Confidence } from '../core/heading.ts'
import type { Step } from '../core/route.ts'
import { cameraMessage, useCamera } from '../hooks/useCamera.ts'

// ④ カメラ表示（AR・要件 F-40〜F-42、設計書 8.1）
// 背面カメラの映像の上に、次に進む方向の矢印を「前方の床に置いた」ように重ねる。
// 床に正確に貼り付けるのではなく、CSS の perspective と rotateX で寝かせて見せるだけ。
// 向きが分からない（QRを読んでいない）ときは矢印を出さず、QRを読むよう案内する

type Props = {
  step: Step
  targetBearing: number | null // 進む方向（図面角度）
  userHeading: number | null // 利用者の向き（図面角度）。基準合わせ前は null
  confidence: Confidence
  isLast: boolean
  onNext: () => void
  onScan: () => void
  onClose: () => void
}

export default function CameraOverlay({ step, targetBearing, userHeading, confidence, isLast, onNext, onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const camera = useCamera(videoRef)
  const message = cameraMessage(camera)
  const showArrow = confidence !== 'none' && userHeading !== null && targetBearing !== null
  const rotation = showArrow ? arrowRotation(userHeading, targetBearing) : 0

  return (
    <div className="v-overlay" role="dialog" aria-label="カメラ表示">
      <video ref={videoRef} className="v-camera-video" playsInline muted />

      <div className="v-ar-top">
        <button type="button" className="v-chip" onClick={onClose}>
          ‹ 地図に戻る
        </button>
        <span className="v-chip v-chip-warn">立ち止まって確認してください</span>
      </div>

      {message && <p className="v-ar-center">{message}</p>}

      {!message && showArrow && (
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

      {!message && !showArrow && camera === 'ready' && (
        <div className="v-ar-center">
          <p>QRコードを読むと、矢印で進む方向を示します</p>
          <button type="button" className="v-primary" onClick={onScan}>
            QRコードを読む
          </button>
        </div>
      )}

      <div className="v-overlay-bottom">
        {showArrow && confidence === 'low' && (
          <p className="v-overlay-sub">矢印がずれているかもしれません。近くのQRコードを読むと正確になります</p>
        )}
        <p className="v-overlay-text">{step.text}</p>
        <div className="v-ar-buttons">
          <button type="button" className="v-secondary" onClick={onScan}>
            QRを読む
          </button>
          <button type="button" className="v-primary" onClick={onNext}>
            {isLast ? '着いた' : '次へ'}
          </button>
        </div>
      </div>
    </div>
  )
}
