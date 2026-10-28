/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Cloudflare Pages はドメインの直下に公開するので base は "/"
  base: '/',
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.ts'],
  },
})
