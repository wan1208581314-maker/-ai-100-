import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    target: 'es2019',
    cssTarget: 'safari13',
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
