import type { Env } from '../../env'

// GET /api/admin/whoami — 管理コンソールにログインしている人のメールアドレスを返す
// 第1週の目的は「Cloudflare Access が /api/admin を守っているか」の確認（設計書 D-7）。
// ※ このヘッダーは Access を通ったときだけ Cloudflare が付ける。
//   保存などの書き込みAPIを作るときは、JWT（Cf-Access-Jwt-Assertion）の署名検証を必ず入れる（設計書 5.6）
export const onRequestGet: PagesFunction<Env> = async ({ request }) => {
  const email = request.headers.get('Cf-Access-Authenticated-User-Email')
  return Response.json({ email })
}
