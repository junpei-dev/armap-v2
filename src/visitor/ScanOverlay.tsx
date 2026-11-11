import jsQR from 'jsqr'
import { useEffect, useRef, useState } from 'react'
import { checkpointFromQr } from '../core/heading.ts'
import { cameraMessage, useCamera } from '../hooks/useCamera.ts'

// ⑤ QR読み取り（要件 F-30〜F-34）
// 背面カメラの映像から jsQR でQRコードを探す。見つけたらチェックポイントIDを返す。
// その瞬間、利用者はQRの壁を見ているので、向きの基準合わせにも使う（呼び出し側で headingRef を読む）

type Props = {
  onFound: (cp: string) => void
  onClose: () => void
}

export default function ScanOverlay({ onFound, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const camera = useCamera(videoRef)
  const [hint, setHint] = useState('QRコードを枠の中に映してください')

  useEffect(() => {
    if (camera !== 'ready') return
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    let timer = 0
    let done = false
    const scan = () => {
      const video = videoRef.current
      if (done || !video || !ctx) return
      if (video.videoWidth > 0) {
        // 処理を軽くするため、横640ピクセルまで縮めて読む
        const scale = Math.min(1, 640 / video.videoWidth)
        canvas.width = Math.round(video.videoWidth * scale)
        canvas.height = Math.round(video.videoHeight * scale)
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })
        if (code) {
          const cp = checkpointFromQr(code.data)
          if (cp) {
            done = true
            navigator.vibrate?.(60)
            onFound(cp)
            return
          }
          setHint('この校内案内のQRコードではありません')
        }
      }
      timer = window.setTimeout(scan, 150) // 1秒に7回くらい
    }
    scan()
    return () => {
      done = true
      clearTimeout(timer)
    }
  }, [camera, onFound])

  const message = cameraMessage(camera)

  return (
    <div className="v-overlay" role="dialog" aria-label="QRコードを読む">
      <video ref={videoRef} className="v-camera-video" playsInline muted />
      <div className="v-scan-frame" aria-hidden />
      <div className="v-overlay-bottom">
        <p className="v-overlay-text">{message ?? (camera === 'starting' ? 'カメラを準備しています…' : hint)}</p>
        <p className="v-overlay-sub">QRコードの正面に立って読むと、矢印の向きが正確になります</p>
        <button type="button" className="v-secondary" onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  )
}
