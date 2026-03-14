import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { writeFileSync } from 'fs'
import { join } from 'path'

/**
 * Dev-only plugin: POST /api/save-topo-data writes to data/topo-data.json
 * (NOT public/ — writing to public/ triggers Vite full page reload!)
 * Also serves GET /data/topo-data.json from data/ dir.
 */
function topoSavePlugin(): Plugin {
  return {
    name: 'topo-save',
    configureServer(server) {
      // Save endpoint
      server.middlewares.use('/api/save-topo-data', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
        let body = ''
        req.on('data', (chunk: string) => { body += chunk })
        req.on('end', () => {
          try {
            const data = JSON.parse(body)
            const filePath = join(process.cwd(), 'data', 'topo-data.json')
            writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true }))
            console.log(`topo-data.json saved (v${data.version}, ${data.topos?.length || 0} topos, ${data.topoRoutes?.length || 0} lines)`)
          } catch (err) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: String(err) }))
          }
        })
      })
      // Serve data/topo-data.json at /tamgaly-climbing-guide/data/topo-data.json
      server.middlewares.use((req, res, next) => {
        if (req.url?.endsWith('/data/topo-data.json')) {
          try {
            const { readFileSync } = require('fs')
            const filePath = join(process.cwd(), 'data', 'topo-data.json')
            const content = readFileSync(filePath, 'utf-8')
            res.setHeader('Content-Type', 'application/json')
            res.end(content)
          } catch {
            next()
          }
        } else {
          next()
        }
      })
    },
  }
}

export default defineConfig({
  base: '/tamgaly-climbing-guide/',
  plugins: [
    react(),
    tailwindcss(),
    topoSavePlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'robots.txt'],
      manifest: {
        name: 'Tamgaly Climbing Guide',
        short_name: 'Tamgaly',
        description: 'Offline-first гайд по скалам Тамгалы-Тас',
        theme_color: '#1e3a5f',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/tamgaly-climbing-guide/',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,json,webmanifest}'],
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: /\/api\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          {
            urlPattern: /\/topos\/.+\.(jpg|jpeg|png|webp)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'topo-photos',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 90 },
            },
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          leaflet: ['leaflet'],
          openseadragon: ['openseadragon'],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  server: {
    proxy: {
      // Exclude /api/save-topo-data (handled by topoSavePlugin)
      '^/api/(?!save-topo-data)': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
