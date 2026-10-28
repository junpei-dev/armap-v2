import { describe, expect, it } from 'vitest'
import {
  generatePasscode,
  hashPasscode,
  newSalt,
  normalizePasscode,
  verifyPasscode,
} from '../functions/lib/password.ts'

describe('パスコード', () => {
  it('XXXX-XXXX-XXXX の形で、読み間違えやすい文字を含まない', () => {
    for (let i = 0; i < 50; i++) {
      const p = generatePasscode()
      expect(p).toMatch(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/)
    }
  })

  it('毎回ちがうパスコードができる', () => {
    const set = new Set(Array.from({ length: 50 }, generatePasscode))
    expect(set.size).toBe(50)
  })

  it('ハイフンの有無・大文字小文字・空白のゆれを同じとみなす', () => {
    expect(normalizePasscode(' k7mq-4xpa 29tr ')).toBe('K7MQ4XPA29TR')
  })

  it('正しいパスコードは通り、違うものは通らない', async () => {
    const salt = newSalt()
    const hash = await hashPasscode('K7MQ-4XPA-29TR', salt)
    expect(await verifyPasscode('K7MQ-4XPA-29TR', salt, hash)).toBe(true)
    expect(await verifyPasscode('k7mq4xpa29tr', salt, hash)).toBe(true)
    expect(await verifyPasscode('K7MQ-4XPA-29TS', salt, hash)).toBe(false)
  })

  it('ソルトが違えば同じパスコードでもハッシュが変わる', async () => {
    const a = await hashPasscode('K7MQ-4XPA-29TR', newSalt())
    const b = await hashPasscode('K7MQ-4XPA-29TR', newSalt())
    expect(a).not.toBe(b)
  })
})
