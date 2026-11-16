import { useEffect, useState } from 'react'
import { createStepDetector } from '../core/steps.ts'

// 歩数を数えるフック（加速度センサー）。enabled のときだけ読む
// ・steps: 数え始めてからの歩数（増えるだけ。区間ごとの歩数は、使う側で差を取る）
// ・working: センサーの値が届いているか（PC や、許可されていない端末では false のまま）
// iPhone では「動きセンサーの許可」（useDeviceHeading.ts の requestOrientationPermission）が済んでいる必要がある

export function useStepCounter(enabled: boolean) {
  const [steps, setSteps] = useState(0)
  const [working, setWorking] = useState(false)

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return
    const feed = createStepDetector()
    let seen = false
    const onMotion = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity
      if (!a || a.x === null || a.y === null || a.z === null) return
      if (!seen) {
        seen = true
        setWorking(true)
      }
      const added = feed(Math.hypot(a.x, a.y, a.z), e.timeStamp)
      if (added > 0) setSteps((s) => s + added)
    }
    window.addEventListener('devicemotion', onMotion)
    return () => window.removeEventListener('devicemotion', onMotion)
  }, [enabled])

  return { steps, working }
}
