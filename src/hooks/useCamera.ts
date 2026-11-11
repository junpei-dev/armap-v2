import { type RefObject, useEffect, useState } from 'react'

// 背面カメラの映像を <video> に映すフック（設計書 8.1）
// ・HTTPS（または localhost）でないと使えない
// ・画面を閉じたら必ずカメラを止める（電池と、カメラが点いたままの不安を防ぐ）
// ・映像は端末の中だけで使い、どこにも送らない

export type CameraState = 'starting' | 'ready' | 'denied' | 'unavailable'

export function useCamera(videoRef: RefObject<HTMLVideoElement | null>): CameraState {
  const [state, setState] = useState<CameraState>('starting')

  useEffect(() => {
    let stream: MediaStream | null = null
    let stopped = false
    if (!navigator.mediaDevices?.getUserMedia) {
      setState('unavailable')
      return
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false })
      .then(async (s) => {
        if (stopped) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        stream = s
        const video = videoRef.current
        if (!video) return
        video.srcObject = s
        video.setAttribute('playsinline', 'true') // iPhone で全画面再生にならないように
        video.muted = true
        await video.play().catch(() => undefined)
        setState('ready')
      })
      .catch((e: DOMException) => setState(e.name === 'NotAllowedError' ? 'denied' : 'unavailable'))
    return () => {
      stopped = true
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [videoRef])

  return state
}

export function cameraMessage(state: CameraState): string | null {
  if (state === 'denied') return 'カメラの使用が許可されていません。ブラウザの設定でカメラを許可してください。'
  if (state === 'unavailable') return 'この端末ではカメラを使えません。地図と文字の案内で進んでください。'
  return null
}
