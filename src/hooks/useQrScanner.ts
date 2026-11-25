import jsQR from 'jsqr'
import { type RefObject, useEffect, useRef } from 'react'
import { checkpointFromQr, focalFromVideo } from '../core/heading.ts'
import type { Point } from '../types.ts'
import type { CameraState } from './useCamera.ts'

// カメラの映像からQRコードを探し続けるフック（来校者のカメラ案内と、管理コンソールの現地調整で共通）
// ・見つけたQRは、画面の上の四隅の座標（object-fit: cover の拡大・切り取りを考えた位置）で知らせる
// ・QRが無いときも毎回呼ぶ（映っていない時間を数えるため）。focal は画面の上の焦点距離（px）
// ・onFrame が true を返す間は速く（60ミリ秒ごと）、それ以外は 150ミリ秒ごとに読む

export type Quad = [Point, Point, Point, Point]
export type QrFrame = {
  cp: string | null // 校内案内のQRならチェックポイントID
  other: boolean // QRは映っているが、校内案内のものではない
  quad: Quad | null
  focal: number | null
  now: number
}

export function useQrScanner(
  videoRef: RefObject<HTMLVideoElement | null>,
  camera: CameraState,
  onFrame: (frame: QrFrame) => boolean | void,
) {
  // 親から渡される関数は描き直しのたびに変わる。読み取りをやり直さないよう ref で持つ
  const handler = useRef(onFrame)
  useEffect(() => {
    handler.current = onFrame
  })

  useEffect(() => {
    if (camera !== 'ready') return
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    let timer = 0
    let stopped = false

    const scan = () => {
      const video = videoRef.current
      if (stopped || !video || !ctx) return
      let fast = false
      if (video.videoWidth > 0) {
        // 処理を軽くするため、横640ピクセルまで縮めて読む
        const down = Math.min(1, 640 / video.videoWidth)
        canvas.width = Math.round(video.videoWidth * down)
        canvas.height = Math.round(video.videoHeight * down)
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })
        // 映像の座標（縮めた分を戻す）→ 画面の座標
        const r = video.getBoundingClientRect()
        const s = Math.max(r.width / video.videoWidth, r.height / video.videoHeight)
        const ox = (r.width - video.videoWidth * s) / 2
        const oy = (r.height - video.videoHeight * s) / 2
        const toScreen = (p: { x: number; y: number }): Point => ({ x: (p.x / down) * s + ox, y: (p.y / down) * s + oy })
        const cp = code ? checkpointFromQr(code.data) : null
        const l = code?.location
        fast = !!handler.current({
          cp,
          other: !!code && !cp,
          quad: l ? [toScreen(l.topLeftCorner), toScreen(l.topRightCorner), toScreen(l.bottomRightCorner), toScreen(l.bottomLeftCorner)] : null,
          focal: focalFromVideo(video.videoWidth, video.videoHeight, s),
          now: Date.now(),
        })
      }
      timer = window.setTimeout(scan, fast ? 60 : 150)
    }
    scan()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [camera, videoRef])
}
