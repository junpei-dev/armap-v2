import {
  type Building,
  type Checkpoint,
  type Edge,
  type EditableTable,
  type GraphNode,
  NODE_KINDS,
  type Room,
  ROOM_CATEGORIES,
  SURVEY_KINDS,
  type SurveyNote,
} from '../../src/types'

// 管理コンソールから送られてきた値を、決まった形にそろえる。
// おかしな値（数値でない・選べない種類など）は、ここで日本語のエラーにする

export class InputError extends Error {}

type Obj = Record<string, unknown>

function obj(v: unknown, name: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new InputError(`${name}がありません`)
  return v as Obj
}
function text(v: unknown, name: string, required = true): string {
  const s = typeof v === 'string' ? v.trim() : v === undefined || v === null ? '' : String(v)
  if (required && !s) throw new InputError(`${name}を入力してください`)
  if (s.length > 200) throw new InputError(`${name}が長すぎます（200文字まで）`)
  return s
}
function number(v: unknown, name: string): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  if (!Number.isFinite(n)) throw new InputError(`${name}は数で入力してください`)
  return n
}
function integer(v: unknown, name: string): number {
  const n = number(v, name)
  if (!Number.isInteger(n)) throw new InputError(`${name}は整数で入力してください`)
  return n
}
function oneOf<T extends string>(v: unknown, list: readonly T[], name: string): T {
  if (!list.includes(v as T)) throw new InputError(`${name}の選び方が正しくありません`)
  return v as T
}
function point(v: unknown, name: string) {
  const o = obj(v, name)
  return { x: number(o.x, `${name}のx`), y: number(o.y, `${name}のy`) }
}
const ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/
function id(v: unknown, name: string): string {
  const s = text(v, name)
  if (!ID_PATTERN.test(s)) throw new InputError(`${name}は半角の英数字・ハイフン・アンダーバーで入力してください`)
  return s
}

export function normalize(table: EditableTable, value: unknown): unknown {
  const o = obj(value, 'データ')
  switch (table) {
    case 'buildings': {
      const outline = Array.isArray(o.outline) ? o.outline.map((p, i) => point(p, `外形の${i + 1}点目`)) : []
      const b: Building = {
        id: id(o.id, '棟番号'),
        name: text(o.name, '棟の名前'),
        drawingName: text(o.drawingName, '図面上の名前'),
        floors: integer(o.floors, '階数'),
        outline,
      }
      if (o.label) b.label = point(o.label, '棟名の位置')
      if (o.origin) b.origin = point(o.origin, '基準点')
      if (o.rotation !== undefined && o.rotation !== null && o.rotation !== '') {
        const r = Number(o.rotation)
        if (r !== 0 && r !== 90 && r !== 180 && r !== 270) throw new InputError('向きは 0・90・180・270 のどれかにしてください')
        b.rotation = r
      }
      return b
    }
    case 'nodes': {
      const n: GraphNode = {
        id: id(o.id, 'ノードID'),
        floor: integer(o.floor, '階'),
        kind: oneOf(o.kind, NODE_KINDS, '種類'),
      }
      const building = text(o.building, '棟', false)
      if (building) n.building = building
      if (o.local) {
        const l = obj(o.local, 'u・v')
        n.local = { u: number(l.u, 'u'), v: number(l.v, 'v') }
      }
      if (o.pos) n.pos = point(o.pos, '位置')
      const landmark = text(o.landmark, '目印', false)
      if (landmark) n.landmark = landmark
      return n
    }
    case 'edges': {
      const e: Edge = {
        from: id(o.from, 'つなぐ元のノード'),
        to: id(o.to, 'つなぐ先のノード'),
        kind: oneOf(o.kind ?? 'walk', ['walk', 'stairs', 'bridge'] as const, '辺の種類'),
        oneway: Boolean(o.oneway),
        closed: Boolean(o.closed),
      }
      if (o.id !== undefined && o.id !== null) e.id = integer(o.id, '辺の番号')
      return e
    }
    case 'rooms': {
      const r: Room = {
        id: id(o.id, '部屋ID'),
        name: text(o.name, '来校者向けの名前'),
        drawingName: text(o.drawingName, '図面上の名前'),
        aliases: Array.isArray(o.aliases) ? o.aliases.map((a) => text(a, '別名')).filter(Boolean) : [],
        building: text(o.building, '棟'),
        floor: integer(o.floor, '階'),
        node: id(o.node, '入口のノード'),
        category: oneOf(o.category, ROOM_CATEGORIES, '分類'),
        visible: o.visible === undefined ? true : Boolean(o.visible),
      }
      const description = text(o.description, '説明', false)
      if (description) r.description = description
      return r
    }
    case 'checkpoints': {
      const c: Checkpoint = {
        id: id(o.id, 'チェックポイントID'),
        node: id(o.node, 'ノード'),
        facing: number(o.facing, '掲示面の向き'),
        place: text(o.place, '掲示場所の説明'),
      }
      return c
    }
    case 'survey': {
      const s: SurveyNote = {
        pos: point(o.pos, '位置'),
        floor: integer(o.floor ?? 1, '階'),
        kind: oneOf(o.kind, SURVEY_KINDS, 'メモの種類'),
        text: text(o.text, 'メモ', false),
        resolved: Boolean(o.resolved),
      }
      const building = text(o.building, '棟', false)
      if (building) s.building = building
      if (o.id !== undefined && o.id !== null) s.id = integer(o.id, 'メモの番号')
      return s
    }
  }
}
