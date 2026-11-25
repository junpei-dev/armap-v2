import { type ReactNode, useEffect, useRef, useState } from 'react'
import { arrowRotation, type Confidence, directionMarker, GROUND_NEAR_M, projectGround, wallYaw } from '../core/heading.ts'
import { angleDiff } from '../core/geometry.ts'
import { cssMatrix3d } from '../core/homography.ts'
import type { Step } from '../core/route.ts'
import type { Progress } from '../core/steps.ts'
import { cameraMessage, useCamera } from '../hooks/useCamera.ts'
import { useFollow } from '../hooks/useFollow.ts'
import { type Quad, useQrScanner } from '../hooks/useQrScanner.ts'

// ④ カメラ案内（AR・要件 F-30〜F-34・F-40〜F-43、設計書 8.1・8.2）
// 「QRを読む画面」と「矢印を見る画面」を1つにまとめた画面。カメラを開いたまま、次の流れが自動で進む
//   1. 映像の中のQRコードをいつも探している（ボタンを押して読み取り画面へ移る必要はない）
//   2. QRが映ったら、現在地と向きの基準を合わせ、QRの貼られた壁の上に進む方向の矢印を出す（マーカーAR）
//   3. QRから目を離すと、前方の床に置いたような矢印に切り替わり、体の向きに合わせて回る（センサー）
// 向きが分からない間（まだQRを映していない）は矢印を出さず、QRを映すよう案内する

type Props = {
  step: Step
  stepIndex: number
  stepCount: number
  targetBearing: number | null // 進む方向（図面角度）
  targetName: string // 次に目指す地点の呼び名（曲がり角・階段・目的地の名前など）
  progress: Progress | null // 残りの距離と「まもなく…」の知らせ（歩数計が使えないときは null）
  target: { bearing: number; distance: number } | null // 次に目指す地点の方向（図面角度）と距離（m）の見積もり
  elevation: number | null // カメラの上向きの角度（度）
  mini: ReactNode // 右上に出す小さな地図（いまの区間・次に目指す地点・自分の位置）
  userHeading: number | null // 利用者の向き（図面角度）。基準合わせ前は null
  confidence: Confidence
  isLast: boolean
  atStairs: boolean // 階段の区間で、階段の入口まで来た（上り下りの途中）
  /**
   * QRを見つけた。現在地と向きを合わせ、移った先の区間の番号を返す（登録の無いQRなら null）
   * yaw: QRを斜めから映している分の見積もり（度・wallYaw）。QRが小さく映っているときは null
   */
  onFound: (cp: string, yaw: number | null) => number | null
  /** 同じQRを映し続けている間、毎回呼ぶ（向きの基準を平均して正確にする） */
  onRefine: (cp: string, yaw: number | null) => void
  /** その地点から進む向き（壁を見て立った人から見た角度。0=前・90=右・-90=左・180=後ろ）。無ければ null */
  arrowFor: (cp: string) => number | null
  onNext: () => void
  onPrev: () => void
  onClose: () => void
}

const ARROW_SIZE = 300 // 壁の矢印の要素の大きさ（px）。QRの周りに QR 1個分ずつ余白を足した範囲を描く
const LOST_MS = 800 // これだけQRが映らなければ「目を離した」とみなし、床の矢印に切り替える
const REANCHOR_MS = 2000 // 同じQRでも、これだけ離れてからもう一度正面で映したら、向きを合わせ直す

type Marker = { cp: string; angle: number | null; step: number; quad: Quad; lost: boolean }

export default function CameraOverlay(props: Props) {
  const { step, stepIndex, stepCount, targetBearing, targetName, progress, target, elevation, mini, userHeading, confidence, isLast, onNext, onPrev, onClose } = props
  const videoRef = useRef<HTMLVideoElement>(null)
  const camera = useCamera(videoRef)
  const [marker, setMarker] = useState<Marker | null>(null)
  const [wrongQr, setWrongQr] = useState(false)
  // 親から渡される関数は、描き直しのたびに変わることがある。読み取りをやり直さないよう ref で持つ
  const handlers = useRef({ onFound: props.onFound, onRefine: props.onRefine, arrowFor: props.arrowFor })
  useEffect(() => {
    handlers.current = { onFound: props.onFound, onRefine: props.onRefine, arrowFor: props.arrowFor }
  })

  // QRの追いかけ（いま追いかけているQR・最後に見えた時刻・見失ったか）
  const track = useRef<{ cp: string | null; seenAt: number; lost: boolean }>({ cp: null, seenAt: 0, lost: false })
  const [focal, setFocal] = useState<number | null>(null)

  useQrScanner(videoRef, camera, ({ cp, other, quad, focal: f, now }) => {
    const t = track.current
    if (f && f !== focal) setFocal(f)
    if (other) setWrongQr(true)
    else if (cp) setWrongQr(false)

    if (cp && quad) {
      const yaw = f ? wallYaw(quad, f) : null
      // 新しいQR、または同じQRをしばらくぶりに正面から映した → 現在地と向きを合わせる
      const again = cp === t.cp && t.lost && now - t.seenAt > REANCHOR_MS && isFrontal(quad)
      if (cp !== t.cp || again) {
        const jumped = handlers.current.onFound(cp, yaw)
        if (jumped !== null) {
          track.current = { cp, seenAt: now, lost: false }
          navigator.vibrate?.(60)
          setMarker({ cp, angle: handlers.current.arrowFor(cp), step: jumped, quad, lost: false })
          return true
        }
      }
      if (cp === t.cp) {
        // 映っている間は、斜めに映った分を見積もって、向きの基準を少しずつ正確にする
        handlers.current.onRefine(cp, yaw)
        track.current = { cp, seenAt: now, lost: false }
        setMarker((m) => (m ? { ...m, quad, lost: false } : m))
        return true
      }
    } else if (t.cp && !t.lost && now - t.seenAt > LOST_MS) {
      track.current = { ...t, lost: true }
      setMarker((m) => (m ? { ...m, lost: true } : m))
    }
    return false
  })

  const message = cameraMessage(camera)
  // 階段の区間: 上り下りの途中は向きの矢印が当てにならない（踊り場で何度も折り返す）ので、
  // 床の矢印の代わりに「階段で○階へ」の札を大きく出す。上りきったら利用者が「次へ」を押す
  const stairs = props.atStairs && step.action.type === 'stairs' ? step.action : null
  const hasHeading = confidence !== 'none' && userHeading !== null && targetBearing !== null
  // 壁の矢印は「QRを読んだ区間」にいる間だけ。「次へ」で先へ進んだら、もうその向きではない
  const wall = marker && marker.angle !== null && marker.step === stepIndex ? marker : null
  // どの矢印を出すか: QRが映っている間は壁の矢印。目を離したら床の矢印（センサーが使えないときは壁の矢印を薄く残す）
  const mode: 'wall' | 'floor' | 'none' =
    message ? 'none' : wall && (!wall.lost || !hasHeading) ? 'wall' : hasHeading && !stairs ? 'floor' : 'none'
  const rotation = hasHeading ? arrowRotation(userHeading, targetBearing) : 0

  // 次に目指す地点の印（向きが分かっている＝床の矢印のときだけ）
  //   近い（6m以内）… 床の上のおおよその位置に輪を置く
  //   遠い … 距離の見積もりを使わず、地平線の高さに「方向の札」を立てる（手前・奥にずれないように）
  const W = window.innerWidth
  const H = window.innerHeight
  const relative = userHeading !== null && target ? angleDiff(userHeading, target.bearing) : 0
  const showTarget = mode === 'floor' && userHeading !== null && target !== null && elevation !== null && target.distance <= 80
  const ground =
    showTarget && target.distance <= GROUND_NEAR_M ? projectGround(relative, target.distance, elevation, W, H, focal ?? undefined) : null
  const sign = showTarget && !ground ? directionMarker(relative, elevation, W, H, focal ?? undefined) : null
  const ringR = ground ? Math.min(90, Math.max(16, ground.scale * 0.7)) : 0 // 半径 0.7m の輪
  // 印は目標の位置をなめらかに追いかける（センサーの細かな揺れでガタつかないように）
  const groundRef = useFollow(ground)
  const signRef = useFollow(sign && !sign.side ? sign : null)
  const distanceText = target ? `約${Math.max(1, Math.round(target.distance))}m` : ''

  // 画面の下に出す1行（いま一番知りたいこと）。カメラの景色を隠さないよう、文字は最小限にする
  let line = step.text
  if (mode === 'wall' && wall && wall.angle !== null) line = directionText(wall.angle)
  else if (progress) line = progress.near ? progress.text : `${targetName}まで ${progress.text.replace('あと ', 'あと')}`

  return (
    <div className="v-overlay" role="dialog" aria-label="カメラ案内">
      <video ref={videoRef} className="v-camera-video" playsInline muted />

      <div className="v-ar-top">
        <button type="button" className="v-ar-back" onClick={onClose} aria-label="地図に戻る">
          ‹
        </button>
        {/* 次に目指す地点を、小さな地図で示す（輪の印が次の地点・青い丸が自分） */}
        <div className="v-ar-mini">
          {mini}
          <span className="v-ar-mini-label">{targetName}</span>
        </div>
      </div>

      {message && <p className="v-ar-center">{message}</p>}

      {!message && camera === 'ready' && mode === 'none' && stairs && (
        <div className="v-ar-stairs" role="status">
          <span className="v-ar-stairs-mark" aria-hidden>
            {stairs.up ? '↑' : '↓'}
          </span>
          <strong>
            階段で{stairs.toFloor}階へ{stairs.up ? '上ります' : '下ります'}
          </strong>
          <small>{stairs.toFloor}階に着いたら「次へ」を押してください</small>
        </div>
      )}

      {!message && camera === 'ready' && mode === 'none' && !stairs && (
        <>
          <div className="v-scan-frame" aria-hidden />
          <p className="v-scan-hint">
            {wrongQr ? 'この校内案内のQRコードではありません' : 'QRコードを映すと矢印が出ます'}
            <small>読まなくても「次へ」で進めます</small>
          </p>
        </>
      )}

      {mode === 'wall' && wall && (
        <div
          className={`v-marker-arrow ${wall.lost ? 'lost' : ''}`}
          style={{ width: ARROW_SIZE, height: ARROW_SIZE, transform: cssMatrix3d(wall.quad, ARROW_SIZE, -1, 2) }}
          aria-hidden
        >
          {/* 中央の 100〜200 が QR。上＝前として、QRのすぐ外側に、進む向きへ回した矢印を描く（QRを隠さない） */}
          <svg viewBox="0 0 300 300" width={ARROW_SIZE} height={ARROW_SIZE}>
            <rect x="100" y="100" width="100" height="100" fill="none" stroke="#fff" strokeWidth="6" rx="6" />
            <g transform={`rotate(${wall.angle} 150 150)`}>
              <path
                d="M150 4 L204 56 L172 56 L172 94 L128 94 L128 56 L96 56 Z"
                fill="var(--me, #1c7ed6)"
                stroke="#fff"
                strokeWidth="6"
                strokeLinejoin="round"
              />
            </g>
          </svg>
        </div>
      )}

      {ground && (
        <div ref={groundRef} className={`v-ground ${confidence === 'low' ? 'low' : ''}`} aria-hidden>
          {/* 地面に寝かせた輪（遠いほど小さい）と、その上に立てた札 */}
          <span className="v-ground-ring" style={{ width: ringR * 2, height: ringR * 0.7 }} />
          <span className="v-ground-pin" />
          <span className="v-ground-label">{targetName}</span>
        </div>
      )}

      {sign && !sign.side && (
        <div ref={signRef} className={`v-sign ${confidence === 'low' ? 'low' : ''}`} aria-hidden>
          {/* 遠い目標: その方向の地平線の上に立てた札。下の棒の先が目標の方向 */}
          <span className="v-sign-label">
            {targetName}
            <small>{distanceText}</small>
          </span>
          <span className="v-sign-pole" />
        </div>
      )}

      {sign?.side && (
        <div className={`v-sign-edge ${sign.side}`} style={{ top: sign.y }} aria-hidden>
          {sign.side === 'left' ? '‹' : '›'}
        </div>
      )}

      {/* 床の矢印: 向きが分かっている間はいつも出す（印が出ていても、進む方向をすぐ分かるように） */}
      {mode === 'floor' && (
        <div className={`v-ar-arrow ${confidence === 'low' ? 'low' : ''}`} aria-hidden>
          {/* 画面の上 = 利用者の正面。進む方向へ回してから、床に寝かせる */}
          <div style={{ transform: `perspective(700px) rotateX(58deg) rotate(${rotation}deg)` }}>
            <svg viewBox="-50 -60 100 120" width="110" height="132">
              <path
                d="M0 -55 L42 -8 L16 -8 L16 55 L-16 55 L-16 -8 L-42 -8 Z"
                fill="var(--me, #1c7ed6)"
                stroke="#fff"
                strokeWidth="5"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      )}

      <div className="v-ar-panel">
        <p className={`v-ar-line ${progress?.near ? 'near' : ''}`} role="status">
          {line}
        </p>
        <div className="v-ar-buttons">
          <button type="button" className="v-ar-prev" onClick={onPrev} disabled={stepIndex === 0} aria-label="前の案内に戻る">
            戻る
          </button>
          <button type="button" className={`v-primary ${progress?.near ? 'v-pulse' : ''}`} onClick={onNext}>
            {isLast ? '着いた' : '次へ'}
            <small className="v-ar-count">
              {stepIndex + 1}/{stepCount}
            </small>
          </button>
        </div>
      </div>
    </div>
  )
}

/** QRをほぼ正面から映しているか（左右の辺の長さがほぼ同じ）。斜めから映したQRでは向きを合わせ直さない */
function isFrontal(q: Quad): boolean {
  const left = Math.hypot(q[3].x - q[0].x, q[3].y - q[0].y)
  const right = Math.hypot(q[2].x - q[1].x, q[2].y - q[1].y)
  const ratio = left / right
  return ratio > 0.85 && ratio < 1.18
}

/** 壁（QR）を見て立った人にとっての向きを言葉にする */
function directionText(angle: number): string {
  const a = Math.abs(angle)
  if (a < 30) return 'この先へ進みます'
  if (a >= 150) return '振り返って、後ろへ進みます'
  return angle > 0 ? 'QRコードを見て、右へ進みます' : 'QRコードを見て、左へ進みます'
}
