import { startNodeId } from '../../../src/core/campus'
import { validate } from '../../../src/core/validate'
import type { AdminData } from '../../../src/types'
import type { Env } from '../../env'
import { loadRaw, loadSurvey } from '../../lib/repo'

// GET /api/admin/data — 管理コンソール向けの全データ（非表示の部屋・現地調査メモ・検査結果を含む）
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const [raw, survey] = await Promise.all([loadRaw(env.DB), loadSurvey(env.DB)])
  const data: AdminData = { ...raw, survey, issues: validate(raw), startNode: startNodeId(raw) }
  return Response.json(data, { headers: { 'Cache-Control': 'no-store' } })
}
