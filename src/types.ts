// 型定義（設計書 5.2）。画面・Functions・検査で共通に使う

/** 全体座標の点（メートル。x は右、y は下が正） */
export type Point = { x: number; y: number }

/** 棟のローカル座標（平面図の左上隅が原点。u は右、v は下が正） */
export type LocalPoint = { u: number; v: number }

/** 平面図を全体座標に置くための情報 */
export type BuildingPlacement = {
  origin: Point // ローカル座標の原点の全体座標
  rotation: 0 | 90 | 180 | 270 // 平面図を時計回りに何度回すと配置図の向きになるか
}

/** 棟 */
export type Building = {
  id: string // 施設台帳の棟番号。例: "1", "28"
  name: string // 来校者向けの名前
  drawingName: string // 図面上の名前
  floors: number
  outline: Point[] // 外形（全体座標）
  label?: Point // 棟名の表示位置（省略時は外形の中心）
  origin?: Point
  rotation?: 0 | 90 | 180 | 270
}

/** ノードの種類 */
export const NODE_KINDS = ['corridor', 'door', 'entrance', 'stairs', 'outdoor'] as const
export type NodeKind = (typeof NODE_KINDS)[number]

/** 画面に出す種類の名前と、IDに使う記号 */
export const NODE_KIND_LABELS: Record<NodeKind, { label: string; code: string }> = {
  corridor: { label: '廊下（角・分かれ道）', code: 'C' },
  door: { label: '部屋の入口', code: 'D' },
  entrance: { label: '棟の出入口', code: 'E' },
  stairs: { label: '階段', code: 'S' },
  outdoor: { label: '屋外', code: 'O' },
}

/** ノード（経路上の地点）。local と pos はどちらか一方を入力する */
export type GraphNode = {
  id: string
  building?: string // 屋外なら無し
  floor: number
  kind: NodeKind
  local?: LocalPoint // 棟のローカル座標（平面図の寸法から入力）
  pos?: Point // 全体座標（地図をタップして置いた場合・屋外）
  landmark?: string // 目印の説明
}

/** 位置を計算済みのノード */
export type PlacedNode = GraphNode & { pos: Point }

/** 辺（ノード同士のつながり） */
export type Edge = {
  id?: number // データベースの番号（新しく作るときは無し）
  from: string
  to: string
  kind: 'walk' | 'stairs' | 'bridge'
  oneway: boolean
  closed: boolean
}

export const ROOM_CATEGORIES = ['admin', 'department', 'general', 'special'] as const
export type RoomCategory = (typeof ROOM_CATEGORIES)[number]
export const ROOM_CATEGORY_LABELS: Record<RoomCategory, string> = {
  admin: '管理棟',
  department: '各科の職員室',
  general: '普通教室',
  special: '特別教室・その他',
}

/** 部屋（目的地） */
export type Room = {
  id: string
  name: string // 来校者向けの名前
  drawingName: string // 図面上の名前
  aliases: string[]
  building: string
  floor: number
  node: string // 入口のノードID
  category: RoomCategory
  description?: string
  visible: boolean
}

/** QRチェックポイント */
export type Checkpoint = {
  id: string // 例: "CP01"
  node: string
  facing: number // 掲示面の向き（図面角度）
  place: string
}

/** 現地調査メモ */
export const SURVEY_KINDS = ['entrance', 'blocked', 'landmark', 'qr_wall', 'other'] as const
export type SurveyKind = (typeof SURVEY_KINDS)[number]
export const SURVEY_KIND_LABELS: Record<SurveyKind, string> = {
  entrance: '出入口',
  blocked: '通れない',
  landmark: '目印',
  qr_wall: 'QRを貼れる壁',
  other: 'その他',
}

export type SurveyNote = {
  id?: number
  pos: Point
  floor: number
  building?: string // 屋外なら無し
  kind: SurveyKind
  text: string
  resolved: boolean
  createdBy?: string
  createdAt?: string
}

/** 設定 */
export type CampusConfig = {
  mapNorthBearing: number | null
  walkSpeed: number
  stairSeconds: number
}

/** データベースの中身（検査や経路計算の入力） */
export type CampusRaw = {
  version: number
  config: CampusConfig
  buildings: Building[]
  nodes: GraphNode[]
  edges: Edge[]
  rooms: Room[]
  checkpoints: Checkpoint[]
}

/** 来校者向けAPIが返す全データ */
export type CampusData = Omit<CampusRaw, 'nodes'> & { nodes: PlacedNode[] }

/** 検査で見つかった問題 */
export type Issue = {
  level: 'fatal' | 'warning' // fatal は保存しない／warning は保存して一覧で示す
  target: string // 例: "ノード B1-1F-C01"
  message: string
}

/** 管理コンソール向けAPIが返す全データ */
export type AdminData = CampusRaw & {
  survey: SurveyNote[]
  issues: Issue[]
  startNode: string | null // 経路の確認に使う出発点（CP01 のノード）
}

/** 編集できるテーブル */
export type EditableTable = 'buildings' | 'nodes' | 'edges' | 'rooms' | 'checkpoints' | 'survey'
