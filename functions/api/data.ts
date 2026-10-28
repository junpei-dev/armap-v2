import { placeNodes, reachableFrom, startNodeId } from '../../src/core/campus'
import type { CampusData } from '../../src/types'
import type { Env } from '../env'
import { loadRaw } from '../lib/repo'

// GET /api/data — 来校者向けの全データ（設計書 5.6）
// ・ノードは位置を計算済みにして返す
// ・事務室から経路がない部屋・非表示の部屋は返さない（要件 F-55）
// ・データの版を ETag にし、変わっていなければ 304（中身なし）を返して通信量を減らす
export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const raw = await loadRaw(env.DB)
  const etag = `"v${raw.version}"`
  if (request.headers.get('If-None-Match') === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } })
  }

  const start = startNodeId(raw)
  const reachable = start ? reachableFrom(start, raw.edges) : new Set<string>()
  const data: CampusData = {
    ...raw,
    nodes: placeNodes(raw),
    rooms: raw.rooms.filter((r) => r.visible && reachable.has(r.node)),
  }
  return Response.json(data, {
    headers: { ETag: etag, 'Cache-Control': 'no-cache' },
  })
}
