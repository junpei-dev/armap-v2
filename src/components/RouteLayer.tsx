import type { Route } from '../core/route.ts'
import { walkedPath } from '../core/steps.ts'
import type { Point } from '../types.ts'
import { useMapScale, useUpright } from './CampusMap.tsx'

// 全体マップに道順を描く（要件 F-16・F-27）。CampusMap の children に入れて使う
// ・これから歩く道はオレンジ、歩き終えた道は青（1階は実線、2階以上は点線にして「○F」を添える）
// ・出発点は ◎、目的地は ●
// ・activeStep を渡すと、その区間を太く強調し、区間の終わり（次に目指す地点）に輪を出す
// ・progress（いまの区間を歩いた距離・m）を渡すと、そこまでを青く塗り、その位置に自分の印（青い丸）を置く
// ・progress が無く animate を付けたときは、自分の位置を表す青い三角が道順に沿って進むアニメーションを出す
//   （activeStep があればその区間だけ、無ければ全体。終わったら少し止まって繰り返す）
// ・focusId を渡すと、強調する区間を囲む見えない四角にその id を付ける（地図をそこへ拡大するため）

/** アニメーションの三角が進む速さ（m/秒）。実際に歩く速さより速くして、待たせないようにする */
const MARKER_SPEED = 12

export default function RouteLayer({
  route,
  activeStep,
  animate = false,
  focusId,
  progress = null,
}: {
  route: Route
  activeStep?: number
  animate?: boolean
  focusId?: string
  progress?: number | null
}) {
  const px = useMapScale()
  const upright = useUpright()
  const start = route.nodes[0]
  const goal = route.nodes[route.nodes.length - 1]
  const current = activeStep !== undefined ? route.steps[activeStep] : undefined

  // アニメーションと拡大の対象になる点の並び
  const focusPts: Point[] = current ? current.nodes.map((n) => n.pos) : route.nodes.map((n) => n.pos)
  // いまの区間で、歩いた所までの道（最後の点が自分の位置）
  const walked = current && progress !== null ? walkedPath(focusPts, progress) : null
  const me = walked ? walked[walked.length - 1] : null

  return (
    <g style={{ pointerEvents: 'none' }}>
      {focusId && <FocusBox id={focusId} pts={focusPts} />}
      {route.steps.map((step, i) => {
        const pts = step.nodes
        const active = activeStep === undefined || activeStep === i
        const done = activeStep !== undefined && i < activeStep // 歩き終えた区間
        return (
          <g key={i}>
            {pts.slice(1).map((b, k) => {
              const a = pts[k]
              if (a.floor !== b.floor) return null // 階段の上り下りは線にしない
              const upper = a.floor >= 2
              return (
                <line
                  key={k}
                  x1={a.pos.x}
                  y1={a.pos.y}
                  x2={b.pos.x}
                  y2={b.pos.y}
                  stroke={done ? 'var(--me, #1c7ed6)' : 'var(--route, #d9480f)'}
                  strokeWidth={(active ? 5 : 3.5) * px}
                  strokeLinecap="round"
                  strokeDasharray={upper ? `${6 * px} ${4 * px}` : undefined}
                  opacity={active ? 0.95 : done ? 0.6 : 0.4}
                />
              )
            })}
            {/* 階が変わる所に「2F」などの印 */}
            {pts.slice(1).map((b, k) =>
              pts[k].floor !== b.floor ? (
                <g key={`f${k}`} transform={upright(b.pos)}>
                  <rect x={b.pos.x + 5 * px} y={b.pos.y - 8 * px} width={22 * px} height={14 * px} rx={3 * px} fill="var(--route, #d9480f)" />
                  <text x={b.pos.x + 16 * px} y={b.pos.y - 1 * px} fontSize={10 * px} fill="#fff" textAnchor="middle" dominantBaseline="central">
                    {b.floor}F
                  </text>
                </g>
              ) : null,
            )}
          </g>
        )
      })}
      {/* いまの区間で歩いた分を青く塗る */}
      {walked && walked.length > 1 && (
        <polyline
          points={walked.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke="var(--me, #1c7ed6)"
          strokeWidth={5 * px}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {/* 出発点 ◎ と 目的地 ● */}
      <circle cx={start.pos.x} cy={start.pos.y} r={9 * px} fill="#fff" stroke="var(--color-main)" strokeWidth={3 * px} />
      <circle cx={start.pos.x} cy={start.pos.y} r={4 * px} fill="var(--color-main)" />
      <circle cx={goal.pos.x} cy={goal.pos.y} r={9 * px} fill="var(--route, #d9480f)" stroke="#fff" strokeWidth={2.5 * px} />
      {/* 次に目指す地点（区間の終わり）: 広がる輪で目立たせる */}
      {current && current.to.id !== goal.id && (
        <g>
          <circle cx={current.to.pos.x} cy={current.to.pos.y} r={7 * px} fill="none" stroke="var(--route, #d9480f)" strokeWidth={2 * px}>
            <animate attributeName="r" values={`${6 * px};${16 * px}`} dur="1.4s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.9;0" dur="1.4s" repeatCount="indefinite" />
          </circle>
          <circle cx={current.to.pos.x} cy={current.to.pos.y} r={6 * px} fill="#fff" stroke="var(--route, #d9480f)" strokeWidth={3 * px} />
        </g>
      )}
      {me && (
        <g>
          <circle cx={me.x} cy={me.y} r={13 * px} fill="var(--me, #1c7ed6)" opacity={0.2} />
          <circle cx={me.x} cy={me.y} r={7 * px} fill="var(--me, #1c7ed6)" stroke="#fff" strokeWidth={2.5 * px} />
        </g>
      )}
      {!me && animate && <MovingMarker key={`${activeStep ?? 'all'}`} pts={focusPts} />}
    </g>
  )
}

/**
 * 道順に沿って進む三角（自分の位置）
 * SVG の animateMotion で、点を結んだ線の上を動かす。rotate="auto" で進む向きに三角の先を向ける
 */
function MovingMarker({ pts }: { pts: Point[] }) {
  const px = useMapScale()
  // 同じ位置の点（階段の上下）は除く
  const path = pts.filter((p, i) => i === 0 || p.x !== pts[i - 1].x || p.y !== pts[i - 1].y)
  if (path.length < 2) return null
  let length = 0
  for (let i = 1; i < path.length; i++) length += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y)
  const move = Math.min(6, Math.max(1.5, length / MARKER_SPEED)) // 動いている秒数
  const pause = 1 // 着いてから止まる秒数
  const d = `M ${path.map((p) => `${p.x} ${p.y}`).join(' L ')}`
  const s = 7 * px
  return (
    <g>
      {/* 三角の先は右（+x）向き。animateMotion が進む向きに回してくれる */}
      <polygon
        points={`${s * 1.2},0 ${-s * 0.8},${-s * 0.8} ${-s * 0.4},0 ${-s * 0.8},${s * 0.8}`}
        fill="var(--me, #1c7ed6)"
        stroke="#fff"
        strokeWidth={1.5 * px}
        strokeLinejoin="round"
      >
        <animateMotion
          dur={`${move + pause}s`}
          repeatCount="indefinite"
          rotate="auto"
          path={d}
          keyPoints="0;1;1"
          keyTimes={`0;${(move / (move + pause)).toFixed(3)};1`}
          calcMode="linear"
        />
      </polygon>
    </g>
  )
}

/** 拡大の目印にする見えない四角（区間の周りに 8m の余白） */
function FocusBox({ id, pts }: { id: string; pts: Point[] }) {
  const m = 8
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const x = Math.min(...xs) - m
  const y = Math.min(...ys) - m
  return <rect id={id} x={x} y={y} width={Math.max(...xs) + m - x} height={Math.max(...ys) + m - y} fill="none" stroke="none" />
}
