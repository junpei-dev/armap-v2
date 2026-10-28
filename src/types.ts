// 型定義（設計書 5.2）。画面・Functions・検査で共通に使う
// 第1週は座標計算に必要な型だけを置き、残りは機能を作るときに追加する

/** 全体座標の点（メートル。x は右、y は下が正） */
export type Point = { x: number; y: number }

/** 棟のローカル座標（平面図の左上隅が原点。u は右、v は下が正） */
export type LocalPoint = { u: number; v: number }

/** 平面図を全体座標に置くための情報 */
export type BuildingPlacement = {
  origin: Point // ローカル座標の原点の全体座標
  rotation: 0 | 90 | 180 | 270 // 平面図を時計回りに何度回すと配置図の向きになるか
}
