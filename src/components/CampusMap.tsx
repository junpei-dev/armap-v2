import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch'
import { centroid } from '../core/geometry.ts'
import type { Building, Point } from '../types.ts'

// 学校全体の地図（設計書 7.2 ②・7.4）
// ・棟の外形を SVG で描く。座標はメートルのまま viewBox に使う
// ・指（またはマウスのホイール）で拡大・移動できる
// ・地図をタップすると、その位置（メートル）を onTap で返す（ドラッグとは区別する）
// ・中に重ねる印（ノードなど）は children に SVG で書く。useMapScale() で「画面の1ピクセルが何mか」が分かる

const MARGIN = 8 // 地図の余白（m）

/** 画面の1ピクセルが何メートルか（印の大きさを拡大率に関係なく一定にするため） */
const ScaleContext = createContext(1)
export function useMapScale(): number {
  return useContext(ScaleContext)
}

type Props = {
  buildings: Building[]
  highlight?: string[] // 色をつける棟
  focus?: string // 強調する棟（太線）
  onTap?: (p: Point) => void
  height?: number | string // 省略すると、敷地の縦横比に合わせる
  children?: ReactNode
}

export default function CampusMap({ buildings, highlight = [], focus, onTap, height, children }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const down = useRef<{ x: number; y: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [widthPx, setWidthPx] = useState(360)

  // 全棟が入る範囲
  const box = useMemo(() => {
    const pts = buildings.flatMap((b) => b.outline)
    if (pts.length === 0) return { x: 0, y: 0, w: 100, h: 100 }
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    const x = Math.min(...xs) - MARGIN
    const y = Math.min(...ys) - MARGIN
    return { x, y, w: Math.max(...xs) + MARGIN - x, h: Math.max(...ys) + MARGIN - y }
  }, [buildings])

  // 地図の幅（ピクセル）を見張る
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidthPx(el.clientWidth || 360))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const metersPerPx = box.w / widthPx / zoom

  /** 画面の座標 → 地図の座標（m）。拡大・移動の CSS 変形を含めて計算する */
  function toMap(clientX: number, clientY: number): Point | null {
    const svg = svgRef.current
    if (!svg) return null
    const r = svg.getBoundingClientRect()
    const scale = Math.min(r.width / box.w, r.height / box.h) // preserveAspectRatio="xMidYMid meet"
    const offX = (r.width - box.w * scale) / 2
    const offY = (r.height - box.h * scale) / 2
    return { x: box.x + (clientX - r.left - offX) / scale, y: box.y + (clientY - r.top - offY) / scale }
  }

  return (
    <div className="campus-map" style={height === undefined ? { aspectRatio: `${box.w} / ${box.h}` } : { height }}>
      <TransformWrapper
        minScale={1}
        maxScale={12}
        doubleClick={{ disabled: true }}
        onTransform={(_, state) => setZoom(state.scale)}
      >
        <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }} contentStyle={{ width: '100%', height: '100%' }}>
          <svg
            ref={svgRef}
            viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
            preserveAspectRatio="xMidYMid meet"
            style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
            onPointerDown={(e) => (down.current = { x: e.clientX, y: e.clientY })}
            onPointerUp={(e) => {
              const d = down.current
              down.current = null
              // 6ピクセル以上動いたらドラッグ（地図の移動）とみなし、タップにしない
              if (!onTap || !d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return
              const p = toMap(e.clientX, e.clientY)
              if (p) onTap(p)
            }}
          >
            <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="var(--map-ground)" />
            {buildings.map((b) => {
              const label = b.label ?? centroid(b.outline)
              const isFocus = b.id === focus
              return (
                <g key={b.id}>
                  <polygon
                    points={b.outline.map((p) => `${p.x},${p.y}`).join(' ')}
                    fill={highlight.includes(b.id) ? 'var(--map-highlight)' : 'var(--map-building)'}
                    stroke={isFocus ? 'var(--color-main)' : 'var(--map-line)'}
                    strokeWidth={(isFocus ? 2.5 : 1) * metersPerPx}
                  />
                  <text
                    x={label.x}
                    y={label.y}
                    fontSize={11 * metersPerPx}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="var(--map-label)"
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {b.id}
                  </text>
                </g>
              )
            })}
            <ScaleContext.Provider value={metersPerPx}>{children}</ScaleContext.Provider>
          </svg>
        </TransformComponent>
      </TransformWrapper>
    </div>
  )
}
