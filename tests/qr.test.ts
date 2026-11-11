import jsQR from 'jsqr'
import QRCode from 'qrcode'
import { describe, expect, it } from 'vitest'
import { checkpointFromQr } from '../src/core/heading.ts'

// 掲示するQRと同じ形のURLを画像にして、jsQR で読めるかを確かめる（カメラの代わり）
function qrImage(text: string, cell = 4) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' })
  const n = qr.modules.size
  const quiet = 4
  const size = (n + quiet * 2) * cell
  const data = new Uint8ClampedArray(size * size * 4).fill(255)
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!qr.modules.get(r, c)) continue
      for (let y = 0; y < cell; y++) {
        for (let x = 0; x < cell; x++) {
          const i = (((r + quiet) * cell + y) * size + (c + quiet) * cell + x) * 4
          data[i] = data[i + 1] = data[i + 2] = 0
        }
      }
    }
  }
  return { data, size }
}

describe('QRの読み取り', () => {
  it('掲示用のURLを読み、チェックポイントIDと四隅の位置が取れる', () => {
    const url = 'https://armap-v2.pages.dev/?cp=CP01'
    const { data, size } = qrImage(url)
    const code = jsQR(data, size, size)
    expect(code?.data).toBe(url)
    expect(checkpointFromQr(code!.data)).toBe('CP01')
    // マーカーAR（設計書 8.2）で使う四隅
    expect(code!.location.topLeftCorner.x).toBeLessThan(code!.location.topRightCorner.x)
  })
})
