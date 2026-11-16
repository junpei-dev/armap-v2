/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig, type ProxyOptions } from 'vite'

// https://vite.dev/config/
// 開発用サーバー（npm run dev）は画面だけを配る。API（/api/…）は別のサーバーへ中継する
//   npm run dev        … 手元の wrangler（npm run pages:dev・ポート8788）へ中継。管理コンソールも試せる
//   npm run dev:prod   … 来校者向けの公開データ（/api/data）だけを本番から読む。見た目の確認用（書き込みはできない）
export default defineConfig(({ mode }) => ({
  // Cloudflare Pages はドメインの直下に公開するので base は "/"
  base: '/',
  plugins: [react()],
  server: {
    proxy: (mode === 'proddata'
      ? { '/api/data': { target: 'https://armap-v2.pages.dev', changeOrigin: true } }
      : { '/api': { target: 'http://localhost:8788' } }) as Record<string, ProxyOptions>,
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
}))
