/// <reference types="vitest/config" />
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// La configuración común vive en ../.env (variables LOREGRAPH_*).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(import.meta.dirname, '..'), 'LOREGRAPH_')
  const apiHost = env.LOREGRAPH_API_HOST || '127.0.0.1'
  const apiPort = env.LOREGRAPH_API_PORT || '8765'
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': path.resolve(import.meta.dirname, './src') },
    },
    server: {
      port: Number(env.LOREGRAPH_FRONTEND_PORT || 5173),
      proxy: {
        // El frontend habla con la API a través de /api (sin CORS en desarrollo).
        '/api': {
          target: `http://${apiHost}:${apiPort}`,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api/, ''),
        },
      },
    },
    build: {
      // Cytoscape y CodeMirror van en trozos aparte que se cargan bajo demanda.
      chunkSizeWarningLimit: 900,
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      css: false,
    },
  }
})
