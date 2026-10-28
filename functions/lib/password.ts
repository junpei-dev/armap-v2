// パスコードのハッシュ化と照合（ブラウザ・Cloudflare・Node.js 共通の Web Crypto を使う）
// パスコードそのものはどこにも保存せず、ハッシュだけを D1 に保存する

// Cloudflare Workers の PBKDF2 は 100,000 回が上限
export const PBKDF2_ITERATIONS = 100_000

function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0))
}

/** パスコードとソルトから PBKDF2-SHA256 のハッシュ（base64）を作る */
export async function hashPasscode(passcode: string, saltBase64: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(normalizePasscode(passcode)),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(saltBase64), iterations: PBKDF2_ITERATIONS },
    key,
    256,
  )
  return toBase64(new Uint8Array(bits))
}

/** ランダムなソルト（base64）を作る */
export function newSalt(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(16)))
}

/** パスコードが正しいか。比較は長さに関係なく一定時間で行う */
export async function verifyPasscode(passcode: string, saltBase64: string, hashBase64: string): Promise<boolean> {
  const actual = await hashPasscode(passcode, saltBase64)
  if (actual.length !== hashBase64.length) return false
  let diff = 0
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ hashBase64.charCodeAt(i)
  return diff === 0
}

/**
 * 入力のゆれをそろえる。パスコードは「K7MQ-4XPA-29TR」の形で配るが、
 * 生徒がハイフンを省いたり小文字で打ったりしても通るようにする
 */
export function normalizePasscode(passcode: string): string {
  return passcode.replace(/[\s-]/g, '').toUpperCase()
}

// 読み間違えやすい文字（0/O, 1/I/L）を除いた31文字
const PASSCODE_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

/** 配布用のパスコードを作る（12文字・4文字ずつハイフン区切り。約59ビット） */
export function generatePasscode(): string {
  const n = PASSCODE_CHARS.length
  const limit = 256 - (256 % n) // これ以上の値は捨てて、文字の出やすさを均等にする
  const chars: string[] = []
  while (chars.length < 12) {
    for (const b of crypto.getRandomValues(new Uint8Array(16))) {
      if (b < limit && chars.length < 12) chars.push(PASSCODE_CHARS[b % n])
    }
  }
  return [0, 4, 8].map((i) => chars.slice(i, i + 4).join('')).join('-')
}

/** セッショントークン（クッキーに入れる値）と、その SHA-256（D1 に保存する値）を作る */
export async function newSessionToken(): Promise<{ token: string; tokenHash: string }> {
  const token = toBase64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g, (c) =>
    c === '+' ? '-' : c === '/' ? '_' : '',
  )
  return { token, tokenHash: await sha256(token) }
}

/** 文字列の SHA-256（base64） */
export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return toBase64(new Uint8Array(digest))
}
