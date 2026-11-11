import { useEffect, useRef, useState } from 'react'
import { averageAngles, deviceHeading } from '../core/heading.ts'

// 端末の向き（動きセンサー）を読むフック（設計書 6.6）
// ・iPhone は、ボタンを押したときに許可を求める必要がある（requestOrientationPermission）
// ・値のぶれは直近の数回分を平均してならす

export type SensorStatus = 'unknown' | 'granted' | 'denied' | 'unsupported'

const STORAGE_KEY = 'armap.sensor'

type IOSDeviceOrientationEvent = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

/** iPhone のように、許可を求める必要があるか */
export function sensorNeedsPermission(): boolean {
  return typeof (globalThis.DeviceOrientationEvent as IOSDeviceOrientationEvent | undefined)?.requestPermission === 'function'
}

/** 前に許可・拒否したか（同じタブの中だけ覚えておく） */
export function savedSensorStatus(): SensorStatus {
  if (typeof globalThis.DeviceOrientationEvent === 'undefined') return 'unsupported'
  if (!sensorNeedsPermission()) return 'granted' // Android などは許可が要らない
  try {
    return (sessionStorage.getItem(STORAGE_KEY) as SensorStatus | null) ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

/** 動きセンサーの許可を求める。必ずボタンを押したときの処理の中で呼ぶ（iPhone の決まり） */
export async function requestOrientationPermission(): Promise<SensorStatus> {
  const E = globalThis.DeviceOrientationEvent as IOSDeviceOrientationEvent | undefined
  if (!E) return 'unsupported'
  let status: SensorStatus = 'granted'
  if (typeof E.requestPermission === 'function') {
    try {
      status = (await E.requestPermission()) === 'granted' ? 'granted' : 'denied'
    } catch {
      status = 'denied'
    }
  }
  try {
    sessionStorage.setItem(STORAGE_KEY, status)
  } catch {
    // 覚えられなくても困らない
  }
  return status
}

/**
 * 端末の向き（deviceHeading・度）。enabled のときだけ読む
 * heading は画面の更新用（0.1秒ごと）、headingRef.current はいつでも最新の値（QRを読んだ瞬間に使う）
 */
export function useDeviceHeading(enabled: boolean) {
  const [heading, setHeading] = useState<number | null>(null)
  const [working, setWorking] = useState(false)
  const headingRef = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return
    const recent: number[] = []
    let lastUpdate = 0
    const onOrientation = (e: DeviceOrientationEvent) => {
      if (e.alpha === null || e.beta === null || e.gamma === null) return
      const h = deviceHeading(e.alpha, e.beta, e.gamma)
      if (h === null) return
      recent.push(h)
      if (recent.length > 5) recent.shift()
      const avg = averageAngles(recent)
      headingRef.current = avg
      const now = performance.now()
      if (now - lastUpdate > 100) {
        lastUpdate = now
        setHeading(avg)
        setWorking(true)
      }
    }
    window.addEventListener('deviceorientation', onOrientation)
    return () => window.removeEventListener('deviceorientation', onOrientation)
  }, [enabled])

  return { heading, headingRef, working }
}
