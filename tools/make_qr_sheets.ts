/**
 * QRコードの掲示用シートの材料を作る（教師用PCで実行・手順書 10章）
 *
 * 使い方:
 *   node tools/make_qr_sheets.ts
 *
 * 本番のデータ（チェックポイント・ノード・棟）を読み、チェックポイントごとに
 *   local/qr/CPxx.png       QRコードの画像（中身は https://armap-v2.pages.dev/?cp=CPxx）
 *   local/qr/sheets.json    シートに載せる情報（場所・貼る向き・周りの地図の形）
 * を作る。続けて python tools/make_qr_pdf.py で A4 の PDF にする。
 * 出力は local/（git に入らない）。ログインには教員のパスコード（local/passcodes.txt）を使う
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import QRCode from 'qrcode'
import { placeNodes } from '../src/core/campus.ts'
import { planRoute } from '../src/core/route.ts'

const BASE = 'https://armap-v2.pages.dev'
const EMAIL = '201536_teacher@g.miyazaki-c.ed.jp'
const OUT = 'local/qr'
const MAP_RADIUS = 45 // シートの地図に入れる範囲（QRの位置から m）

const passcode = readFileSync('local/passcodes.txt', 'utf8')
  .split(/\r?\n/)
  .find((l) => l.startsWith(EMAIL))!
  .split('\t')[1]
const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, passcode }),
})
const cookie = login.headers.get('set-cookie')!.split(';')[0]
const data = await (await fetch(`${BASE}/api/admin/data`, { headers: { Cookie: cookie } })).json()
await fetch(`${BASE}/api/auth/logout`, { method: 'POST', headers: { Cookie: cookie } })

const placed = placeNodes(data)
const start = data.checkpoints.find((c: { id: string }) => c.id === 'CP01').node
mkdirSync(OUT, { recursive: true })

const sheets = []
for (const cp of data.checkpoints) {
  const node = placed.find((n) => n.id === cp.node)!
  // このQRの地点を通る目的地と、そこへ来る直前のノード（歩いてくる方向）
  const via: string[] = []
  let from = null
  let path: { x: number; y: number }[] = [] // 歩いてくる道（この地点から約30m手前まで）
  for (const r of data.rooms) {
    const route = planRoute(placed, data.edges, data.checkpoints, data.config, start, r.node, r.name)
    const i = route?.nodes.findIndex((n) => n.id === node.id) ?? -1
    if (route && i >= 0) {
      via.push(r.name)
      if (i > 0 && !from) {
        from = route.nodes[i - 1].pos
        let len = 0
        path = [node.pos]
        for (let k = i - 1; k >= 0 && len < 30; k--) {
          const a = route.nodes[k + 1].pos
          const b = route.nodes[k].pos
          len += Math.hypot(a.x - b.x, a.y - b.y)
          path.push(b)
        }
      }
    }
  }
  const url = `${BASE}/?cp=${cp.id}`
  await QRCode.toFile(`${OUT}/${cp.id}.png`, url, { errorCorrectionLevel: 'M', margin: 4, width: 1200 })
  // 周りの棟の外形（地図用）
  const near = data.buildings.filter((b: { outline: { x: number; y: number }[] }) =>
    b.outline.some((p) => Math.abs(p.x - node.pos.x) < MAP_RADIUS * 1.5 && Math.abs(p.y - node.pos.y) < MAP_RADIUS * 1.5),
  )
  sheets.push({
    id: cp.id,
    url,
    place: cp.place,
    landmark: node.landmark ?? '',
    floor: node.floor,
    facing: cp.facing,
    pos: node.pos,
    from,
    path,
    via,
    buildings: near.map((b: { id: string; outline: unknown }) => ({ id: b.id, outline: b.outline })),
  })
}
writeFileSync(`${OUT}/sheets.json`, JSON.stringify({ radius: MAP_RADIUS, sheets }, null, 1))
console.log(`${sheets.length}枚分の材料を ${OUT}/ に作りました`)
