import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      // g.html: /g/* oyun linkleri için aynı uygulama, farklı sosyal önizleme.
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        game: fileURLToPath(new URL('./g.html', import.meta.url)),
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
