import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  // Local dev: proxy /api/claude to a local mock or your own server
  server: {
    proxy: {
      '/api/claude': {
        target: 'http://localhost:8888', // netlify dev port
        changeOrigin: true,
      }
    }
  }
})
