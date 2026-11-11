import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { type ReactZoomPanPinchContentRef, TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch'
import { centroid } from '../core/geometry.ts'
import type { Building, Point } from '../types.ts'

// 学校全体の地図（設計書 7.2 ②・7.4）
// ・棟の外形を SVG で描く。座標はメートルのまま viewBox に使う
// ・指（またはマウスのホイール）で拡大・移動できる
// ・地図をタップすると、その位置（メートル）を onTap で返す（ドラッグとは区別する）
// ・中に重ねる印（ノードなど）は children に SVG で書く。useMapScale() で「画面の1ピクセルが何mか」が分かる
// ・地図は配置図を MAP_ROTATION 度回して表示する（2026-11-11 先生の指示: 正門が下に来て、進む方向が上になる向き）
//   データの座標はそのまま。文字や向きのある印は useUpright() で逆に回して正立させる

const MARGIN = 8 // 地図の余白（m）

/** 配置図を何度回して表示するか。正門（配置図の右上）が画面の左下に来るよう180度 */
export const MAP_ROTATION = 180

type MapView = {
  px: number
  upright: (p: Point) => string
  toMap: (clientX: number, clientY: number) => Point | null
}
const MapContext = createContext<MapView>({ px: 1, upright: () => '', toMap: () => null })

/** この class を付けた要素の上で押したときは、地図を動かさない（ノードのドラッグなどに使う） */
export const NO_PAN_CLASS = 'map-no-pan'

/** 画面の1ピクセルが何メートルか（印の大きさを拡大率に関係なく一定にするため） */
export function useMapScale(): number {
  return useContext(MapContext).px
}

/**
 * 文字や向きのある印を、地図の回転に関係なく正立させる変形を返す
 * 使い方: <text transform={upright(p)} ...> ／ <g transform={upright(p)}> … </g>
 */
export function useUpright(): (p: Point) => string {
  return useContext(MapContext).upright
}

/** 画面の位置（clientX, clientY）を地図の座標（m）に直す関数 */
export function useMapPoint(): (clientX: number, clientY: number) => Point | null {
  return useContext(MapContext).toMap
}

type Props = {
  buildings: Building[]
  highlight?: string[] // 色をつける棟
  focus?: string // 強調する棟（太線）
  onTap?: (p: Point) => void
  height?: number | string // 省略すると、敷地の縦横比に合わせる
  zoomTo?: string // この棟まで拡大する（空なら全体に戻す）
  children?: ReactNode
}

export default function CampusMap({ buildings, highlight = [], focus, onTap, height, zoomTo, children }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const zoomRef = useRef<ReactZoomPanPinchContentRef>(null)
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

  // 指定の棟まで拡大する（地図エディタの「担当の棟」など）
  useEffect(() => {
    const z = zoomRef.current
    if (!z) return
    if (zoomTo) void z.zoomToElement(`campus-bldg-${zoomTo}`, { maxScale: 10 }, 400)
    else void z.resetTransform(300)
  }, [zoomTo])

  const metersPerPx = box.w / widthPx / zoom
  // 回転の中心（地図の範囲の中心）。180度なら範囲がそのまま重なるので viewBox は変えなくてよい
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2

  /** 画面の座標 → 地図の座標（m）。拡大・移動の CSS 変形を含めて計算する */
  function toMap(clientX: number, clientY: number): Point | null {
    const svg = svgRef.current
    if (!svg) return null
    const r = svg.getBoundingClientRect()
    const scale = Math.min(r.width / box.w, r.height / box.h) // preserveAspectRatio="xMidYMid meet"
    const offX = (r.width - box.w * scale) / 2
    const offY = (r.height - box.h * scale) / 2
    const vx = box.x + (clientX - r.left - offX) / scale
    const vy = box.y + (clientY - r.top - offY) / scale
    // 表示は中心まわりに回してあるので、逆に回してデータの座標に戻す
    const t = (-MAP_ROTATION * Math.PI) / 180
    const dx = vx - cx
    const dy = vy - cy
    return { x: cx + dx * Math.cos(t) - dy * Math.sin(t), y: cy + dx * Math.sin(t) + dy * Math.cos(t) }
  }

  // toMap は毎回作り直されるが、中で使う値（box・回転の中心）は描画ごとに同じなので問題ない
  const view: MapView = { px: metersPerPx, upright: (p) => (MAP_ROTATION ? `rotate(${-MAP_ROTATION} ${p.x} ${p.y})` : ''), toMap }

  return (
    <div className="campus-map" style={height === undefined ? { aspectRatio: `${box.w} / ${box.h}` } : { height }}>
      <TransformWrapper
        ref={zoomRef}
        minScale={1}
        maxScale={12}
        doubleClick={{ disabled: true }}
        panning={{ excluded: [NO_PAN_CLASS] }}
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
            <g transform={`rotate(${MAP_ROTATION} ${cx} ${cy})`}>
            {buildings.map((b) => {
              const label = b.label ?? centroid(b.outline)
              const isFocus = b.id === focus
              return (
                <g key={b.id}>
                  <polygon
                    id={`campus-bldg-${b.id}`}
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
                    transform={view.upright(label)}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {b.id}
                  </text>
                </g>
              )
            })}
            <MapContext.Provider value={view}>{children}</MapContext.Provider>
            </g>
          </svg>
        </TransformComponent>
      </TransformWrapper>
    </div>
  )
}
