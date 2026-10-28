import type {
  Building,
  CampusConfig,
  CampusRaw,
  Checkpoint,
  Edge,
  EditableTable,
  GraphNode,
  Room,
  SurveyNote,
} from '../../src/types'

// D1 の行（snake_case）と、アプリの型（camelCase）の変換・読み書き（設計書 5.1・5.6）

type Row = Record<string, unknown>

const num = (v: unknown): number | undefined => (v === null || v === undefined ? undefined : Number(v))
const str = (v: unknown): string | undefined => (v === null || v === undefined || v === '' ? undefined : String(v))

// ---------- 行 → 型 ----------

export function buildingFromRow(r: Row): Building {
  const ox = num(r.origin_x)
  const oy = num(r.origin_y)
  const lx = num(r.label_x)
  const ly = num(r.label_y)
  const rotation = num(r.rotation)
  return {
    id: String(r.id),
    name: String(r.name),
    drawingName: String(r.drawing_name),
    floors: Number(r.floors),
    outline: JSON.parse(String(r.outline)),
    ...(lx !== undefined && ly !== undefined ? { label: { x: lx, y: ly } } : {}),
    ...(ox !== undefined && oy !== undefined ? { origin: { x: ox, y: oy } } : {}),
    ...(rotation !== undefined ? { rotation: rotation as Building['rotation'] } : {}),
  }
}

export function nodeFromRow(r: Row): GraphNode {
  const u = num(r.u)
  const v = num(r.v)
  const x = num(r.x)
  const y = num(r.y)
  return {
    id: String(r.id),
    ...(str(r.building_id) ? { building: str(r.building_id) } : {}),
    floor: Number(r.floor),
    kind: r.kind as GraphNode['kind'],
    ...(u !== undefined && v !== undefined ? { local: { u, v } } : {}),
    ...(x !== undefined && y !== undefined ? { pos: { x, y } } : {}),
    ...(str(r.landmark) ? { landmark: str(r.landmark) } : {}),
  }
}

export function edgeFromRow(r: Row): Edge {
  return {
    id: Number(r.id),
    from: String(r.from_id),
    to: String(r.to_id),
    kind: r.kind as Edge['kind'],
    oneway: Boolean(r.oneway),
    closed: Boolean(r.closed),
  }
}

export function roomFromRow(r: Row): Room {
  return {
    id: String(r.id),
    name: String(r.name),
    drawingName: String(r.drawing_name),
    aliases: JSON.parse(String(r.aliases ?? '[]')),
    building: String(r.building_id),
    floor: Number(r.floor),
    node: String(r.node_id),
    category: r.category as Room['category'],
    ...(str(r.description) ? { description: str(r.description) } : {}),
    visible: Boolean(r.visible),
  }
}

export function checkpointFromRow(r: Row): Checkpoint {
  return { id: String(r.id), node: String(r.node_id), facing: Number(r.facing), place: String(r.place) }
}

export function surveyFromRow(r: Row): SurveyNote {
  return {
    id: Number(r.id),
    pos: { x: Number(r.x), y: Number(r.y) },
    floor: Number(r.floor),
    ...(str(r.building_id) ? { building: str(r.building_id) } : {}),
    kind: r.kind as SurveyNote['kind'],
    text: String(r.text ?? ''),
    resolved: Boolean(r.resolved),
    ...(str(r.created_by) ? { createdBy: str(r.created_by) } : {}),
    ...(str(r.created_at) ? { createdAt: str(r.created_at) } : {}),
  }
}

// ---------- 読み込み ----------

export async function loadRaw(db: D1Database): Promise<CampusRaw> {
  const [config, buildings, nodes, edges, rooms, checkpoints] = await db.batch([
    db.prepare('SELECT key, value FROM config'),
    db.prepare('SELECT * FROM buildings ORDER BY id'),
    db.prepare('SELECT * FROM nodes ORDER BY id'),
    db.prepare('SELECT * FROM edges ORDER BY id'),
    db.prepare('SELECT * FROM rooms ORDER BY id'),
    db.prepare('SELECT * FROM checkpoints ORDER BY id'),
  ])
  const cfg = new Map((config.results as Row[]).map((r) => [String(r.key), r.value as string | null]))
  const north = cfg.get('mapNorthBearing')
  const conf: CampusConfig = {
    mapNorthBearing: north === null || north === undefined ? null : Number(north),
    walkSpeed: Number(cfg.get('walkSpeed') ?? 1),
    stairSeconds: Number(cfg.get('stairSeconds') ?? 15),
  }
  return {
    version: Number(cfg.get('dataVersion') ?? 0),
    config: conf,
    buildings: (buildings.results as Row[]).map(buildingFromRow),
    nodes: (nodes.results as Row[]).map(nodeFromRow),
    edges: (edges.results as Row[]).map(edgeFromRow),
    rooms: (rooms.results as Row[]).map(roomFromRow),
    checkpoints: (checkpoints.results as Row[]).map(checkpointFromRow),
  }
}

export async function loadSurvey(db: D1Database): Promise<SurveyNote[]> {
  const { results } = await db.prepare('SELECT * FROM survey_notes ORDER BY id DESC').all()
  return (results as Row[]).map(surveyFromRow)
}

// ---------- 書き込み ----------

/** テーブルごとの「キーの列」と、型 → 列の値の変換 */
export const TABLES: Record<
  EditableTable,
  { table: string; key: string; toColumns: (v: never) => Record<string, unknown> }
> = {
  buildings: {
    table: 'buildings',
    key: 'id',
    toColumns: (b: Building) => ({
      id: b.id,
      name: b.name,
      drawing_name: b.drawingName,
      floors: b.floors,
      outline: JSON.stringify(b.outline),
      label_x: b.label?.x ?? null,
      label_y: b.label?.y ?? null,
      origin_x: b.origin?.x ?? null,
      origin_y: b.origin?.y ?? null,
      rotation: b.rotation ?? null,
    }),
  },
  nodes: {
    table: 'nodes',
    key: 'id',
    toColumns: (n: GraphNode) => ({
      id: n.id,
      building_id: n.building ?? null,
      floor: n.floor,
      kind: n.kind,
      u: n.local?.u ?? null,
      v: n.local?.v ?? null,
      x: n.pos?.x ?? null,
      y: n.pos?.y ?? null,
      landmark: n.landmark ?? null,
    }),
  },
  edges: {
    table: 'edges',
    key: 'id',
    toColumns: (e: Edge) => ({
      ...(e.id !== undefined ? { id: e.id } : {}),
      from_id: e.from,
      to_id: e.to,
      kind: e.kind,
      oneway: e.oneway ? 1 : 0,
      closed: e.closed ? 1 : 0,
    }),
  },
  rooms: {
    table: 'rooms',
    key: 'id',
    toColumns: (r: Room) => ({
      id: r.id,
      name: r.name,
      drawing_name: r.drawingName,
      aliases: JSON.stringify(r.aliases ?? []),
      building_id: r.building,
      floor: r.floor,
      node_id: r.node,
      category: r.category,
      description: r.description ?? null,
      visible: r.visible ? 1 : 0,
    }),
  },
  checkpoints: {
    table: 'checkpoints',
    key: 'id',
    toColumns: (c: Checkpoint) => ({ id: c.id, node_id: c.node, facing: c.facing, place: c.place }),
  },
  survey: {
    table: 'survey_notes',
    key: 'id',
    toColumns: (s: SurveyNote) => ({
      ...(s.id !== undefined ? { id: s.id } : {}),
      x: s.pos.x,
      y: s.pos.y,
      floor: s.floor,
      building_id: s.building ?? null,
      kind: s.kind,
      text: s.text,
      resolved: s.resolved ? 1 : 0,
    }),
  },
}

/** INSERT（追加）か UPDATE（修正）の文を作る。列名は TABLES で決めたものだけを使う */
export function upsertStatement(
  db: D1Database,
  table: EditableTable,
  value: unknown,
  user: string,
  mode: 'insert' | 'update',
): D1PreparedStatement {
  const def = TABLES[table]
  const cols = def.toColumns(value as never)
  if (table !== 'survey') {
    cols.updated_by = user
  } else if (mode === 'insert') {
    cols.created_by = user
  }
  const names = Object.keys(cols)
  if (mode === 'insert') {
    const sql = `INSERT INTO ${def.table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`
    return db.prepare(sql).bind(...names.map((n) => cols[n]))
  }
  const sets = names.filter((n) => n !== def.key).map((n) => `${n} = ?`)
  if (table !== 'survey') sets.push("updated_at = datetime('now')")
  const sql = `UPDATE ${def.table} SET ${sets.join(', ')} WHERE ${def.key} = ?`
  return db.prepare(sql).bind(...names.filter((n) => n !== def.key).map((n) => cols[n]), cols[def.key])
}

export function deleteStatement(db: D1Database, table: EditableTable, key: string | number): D1PreparedStatement {
  const def = TABLES[table]
  return db.prepare(`DELETE FROM ${def.table} WHERE ${def.key} = ?`).bind(key)
}

/** 変更履歴に1件書く */
export function logStatement(
  db: D1Database,
  user: string,
  table: EditableTable,
  recordId: string,
  action: 'insert' | 'update' | 'delete',
  before: unknown,
  after: unknown,
): D1PreparedStatement {
  return db
    .prepare(
      'INSERT INTO change_log (user_email, table_name, record_id, action, before, after) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .bind(
      user,
      table,
      recordId,
      action,
      before === undefined ? null : JSON.stringify(before),
      after === undefined ? null : JSON.stringify(after),
    )
}

/** データの版を1つ上げる（来校者の画面が新しいデータを取りに行くきっかけ） */
export function bumpVersionStatement(db: D1Database): D1PreparedStatement {
  return db.prepare("UPDATE config SET value = CAST(value AS INTEGER) + 1 WHERE key = 'dataVersion'")
}
