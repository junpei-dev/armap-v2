import { useEffect, useRef } from 'react'

// 画面の上の印（床の輪・方向の札）を、なめらかに目標の位置へ追いかけさせるフック
// ・センサーの値は手ぶれで細かく揺れるので、印をそのまま動かすとガタつく
// ・毎フレーム（requestAnimationFrame）、いまの位置から目標へ一定の割合だけ近づける（指数的な追従）
// ・2px より小さな動きは無視する（止まっているときに印がふるえないように）
// ・React の描き直しを通さず、要素の transform を直接書きかえる（軽くするため）
// 使い方: const ref = useFollow(target); <div ref={ref} …>（left/top は 0 にしておく）

const FOLLOW = 0.14 // 1フレームで目標へ近づく割合（小さいほどなめらかだが、遅れる）
const DEADBAND_PX = 2

export function useFollow(target: { x: number; y: number } | null) {
  const ref = useRef<HTMLDivElement>(null)
  const goal = useRef(target)
  useEffect(() => {
    goal.current = target
  })

  useEffect(() => {
    let raf = 0
    let cur: { x: number; y: number } | null = null
    let lastEl: HTMLDivElement | null = null
    const tick = () => {
      const g = goal.current
      const el = ref.current
      if (g && el) {
        if (!cur || el !== lastEl) {
          // 出たばかりの印は、目標の位置にそのまま置く
          cur = { ...g }
          lastEl = el
        } else {
          const dx = g.x - cur.x
          const dy = g.y - cur.y
          if (Math.hypot(dx, dy) > DEADBAND_PX) {
            cur.x += dx * FOLLOW
            cur.y += dy * FOLLOW
          }
        }
        el.style.transform = `translate(${cur.x}px, ${cur.y}px)`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return ref
}
