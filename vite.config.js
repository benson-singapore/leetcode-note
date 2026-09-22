import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**', '**/server/**'],
    },
    // 浏览器调试时代理到 Go sidecar（固定端口 17877）
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:17877',
        changeOrigin: true,
      },
    },
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: 'chrome105',
    minify: 'esbuild',
    sourcemap: false,
  },
})
