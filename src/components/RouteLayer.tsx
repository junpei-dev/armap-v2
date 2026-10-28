import type { Route } from '../core/route.ts'
import { useMapScale } from './CampusMap.tsx'

// 全体マップに道順を描く（要件 F-16・F-27）。CampusMap の children に入れて使う
// ・1階の区間は実線、2階以上の区間は点線にして「○F」を添える
// ・出発点は ◎、目的地は ●
// ・activeStep を渡すと、その区間を太く強調する

export default function RouteLayer({ route, activeStep }: { route: Route; activeStep?: number }) {
  const px = useMapScale()
  const start = route.nodes[0]
  const goal = route.nodes[route.nodes.length - 1]

  return (
    <g style={{ pointerEvents: 'none' }}>
      {route.steps.map((step, i) => {
        const pts = step.nodes
        const active = activeStep === undefined || activeStep === i
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
                  stroke="var(--route, #d9480f)"
                  strokeWidth={(active ? 5 : 3) * px}
                  strokeLinecap="round"
                  strokeDasharray={upper ? `${6 * px} ${4 * px}` : undefined}
                  opacity={active ? 0.95 : 0.35}
                />
              )
            })}
            {/* 階が変わる所に「2F」などの印 */}
            {pts.slice(1).map((b, k) =>
              pts[k].floor !== b.floor ? (
                <g key={`f${k}`}>
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
      {/* 出発点 ◎ と 目的地 ● */}
      <circle cx={start.pos.x} cy={start.pos.y} r={9 * px} fill="#fff" stroke="var(--color-main)" strokeWidth={3 * px} />
      <circle cx={start.pos.x} cy={start.pos.y} r={4 * px} fill="var(--color-main)" />
      <circle cx={goal.pos.x} cy={goal.pos.y} r={9 * px} fill="var(--route, #d9480f)" stroke="#fff" strokeWidth={2.5 * px} />
    </g>
  )
}
