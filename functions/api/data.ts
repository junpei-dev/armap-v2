import type { Env } from '../env'

// GET /api/data — 来校者向けの全データ（設計書 5.6）
// 第1週は動作確認のため「データの版」だけを返す。棟・ノードなどは第2週以降に追加する
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const row = await env.DB.prepare("SELECT value FROM config WHERE key = 'dataVersion'").first<{
    value: string
  }>()
  const version = Number(row?.value ?? 0)
  return Response.json({ version })
}
