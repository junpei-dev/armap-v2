import type { CampusRaw, Issue } from '../types.ts'
import { nodePosition, placementOf, reachableFrom, START_CHECKPOINT_ID, startNodeId } from './campus.ts'
import { pointInPolygon } from './geometry.ts'

// データの検査（設計書 5.5）
// サーバー（保存のとき）と管理コンソール（画面の表示）の両方で、この1つの関数を使う。
//   fatal   … 保存しない（存在しないものを指している、など）
//   warning … 保存する。管理コンソールの「注意」に一覧で出す

export function validate(raw: CampusRaw): Issue[] {
  const issues: Issue[] = []
  const fatal = (target: string, message: string) => issues.push({ level: 'fatal', target, message })
  const warn = (target: string, message: string) => issues.push({ level: 'warning', target, message })

  const buildings = new Map(raw.buildings.map((b) => [b.id, b]))
  const nodes = new Map(raw.nodes.map((n) => [n.id, n]))

  // --- IDの重複 ---
  for (const [name, list] of [
    ['棟', raw.buildings],
    ['ノード', raw.nodes],
    ['部屋', raw.rooms],
    ['チェックポイント', raw.checkpoints],
  ] as const) {
    const seen = new Set<string>()
    for (const item of list) {
      if (seen.has(item.id)) fatal(`${name} ${item.id}`, 'IDが重複しています')
      seen.add(item.id)
    }
  }

  // --- 棟 ---
  for (const b of raw.buildings) {
    if (b.outline.length < 3) fatal(`棟 ${b.id}`, '外形の頂点が3つ未満です')
    if (b.floors < 1) fatal(`棟 ${b.id}`, '階数が1未満です')
  }

  // --- ノード ---
  const connected = new Set(raw.edges.flatMap((e) => [e.from, e.to]))
  for (const n of raw.nodes) {
    const t = `ノード ${n.id}`
    const b = n.building ? buildings.get(n.building) : undefined
    if (n.building && !b) fatal(t, `存在しない棟（${n.building}）を指しています`)
    if (b && (n.floor < 1 || n.floor > b.floors)) fatal(t, `${n.floor}階は、この棟（${b.floors}階建て）にありません`)
    if (!n.local && !n.pos) fatal(t, '位置（u・v か x・y）がありません')
    if (n.local && n.pos) fatal(t, '位置は u・v と x・y のどちらか一方だけにしてください')
    if (n.local && !n.building) fatal(t, 'u・v で位置を入れるときは棟を選んでください')
    if (n.local && b && !placementOf(b)) fatal(t, `棟 ${b.id} は平面図の置き方（基準点・向き）が未設定なので、u・v は使えません`)
    if (!connected.has(n.id)) warn(t, 'どの辺ともつながっていません')
    if (!n.building && n.kind !== 'outdoor') warn(t, '屋外のノードですが、種類が「屋外」ではありません')

    // 屋内ノードが棟の外にないか
    const pos = nodePosition(n, buildings)
    if (b && pos && b.outline.length >= 3 && !pointInPolygon(pos, b.outline)) {
      warn(t, `棟 ${b.id} の外形の外にあります`)
    }
  }

  // --- 辺 ---
  const edgeKeys = new Set<string>()
  for (const e of raw.edges) {
    const t = `辺 ${e.from} → ${e.to}`
    const a = nodes.get(e.from)
    const c = nodes.get(e.to)
    if (!a) fatal(t, `存在しないノード（${e.from}）を指しています`)
    if (!c) fatal(t, `存在しないノード（${e.to}）を指しています`)
    if (e.from === e.to) fatal(t, '同じノード同士はつなげません')
    const key = [e.from, e.to].sort().join('|')
    if (edgeKeys.has(key)) fatal(t, '同じ2つのノードをつなぐ辺がすでにあります')
    edgeKeys.add(key)
    if (a && c) {
      if (a.floor !== c.floor && e.kind !== 'stairs') warn(t, '階の違うノード同士なのに、種類が「階段」ではありません')
      if (e.kind === 'stairs') {
        if (Math.abs(a.floor - c.floor) !== 1) warn(t, '階段の両端は、階が1つ違うノードにしてください')
        if (a.building !== c.building) warn(t, '階段の両端が別の棟になっています')
      }
    }
  }

  // --- 部屋 ---
  for (const r of raw.rooms) {
    const t = `部屋 ${r.name}（${r.id}）`
    const b = buildings.get(r.building)
    if (!b) fatal(t, `存在しない棟（${r.building}）を指しています`)
    if (b && (r.floor < 1 || r.floor > b.floors)) fatal(t, `${r.floor}階は、この棟にありません`)
    const n = nodes.get(r.node)
    if (!n) fatal(t, `存在しないノード（${r.node}）を入口にしています`)
    else if (n.floor !== r.floor || n.building !== r.building) warn(t, '入口のノードの棟・階が、部屋の棟・階と違います')
    if (!r.name.trim()) fatal(t, '来校者向けの名前が空です')
  }

  // --- チェックポイント ---
  for (const c of raw.checkpoints) {
    const t = `チェックポイント ${c.id}`
    if (!nodes.has(c.node)) fatal(t, `存在しないノード（${c.node}）を指しています`)
    if (!(c.facing >= 0 && c.facing < 360)) fatal(t, '掲示面の向きは 0以上360未満 にしてください')
  }

  // --- 事務室からのつながり（来校者の一覧に出せるか・要件 F-55） ---
  const start = startNodeId(raw)
  if (!start) {
    warn(`チェックポイント ${START_CHECKPOINT_ID}`, '事務室のチェックポイント（CP01）が未登録です。登録するまで、来校者の目的地一覧には何も出ません')
  } else {
    const reachable = reachableFrom(start, raw.edges)
    for (const r of raw.rooms) {
      if (nodes.has(r.node) && !reachable.has(r.node)) {
        warn(`部屋 ${r.name}（${r.id}）`, '事務室（CP01）から経路がつながっていないため、来校者の一覧に出ません')
      }
    }
  }

  return issues
}

/** 致命的な問題だけを取り出す */
export function fatalIssues(issues: Issue[]): Issue[] {
  return issues.filter((i) => i.level === 'fatal')
}

/** 変更前には無かった致命的な問題だけを取り出す（もともとある問題で、関係ない保存を止めないため） */
export function newFatalIssues(before: Issue[], after: Issue[]): Issue[] {
  const old = new Set(before.filter((i) => i.level === 'fatal').map((i) => `${i.target}|${i.message}`))
  return after.filter((i) => i.level === 'fatal' && !old.has(`${i.target}|${i.message}`))
}
