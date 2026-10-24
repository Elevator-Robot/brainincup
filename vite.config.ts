import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { createLocalVoiceMiddleware } from './scripts/local-chat-voice';

// https://vitejs.dev/config/
export default defineConfig({
  // Vitest uses its own Vite version; keep its extension out of Vite 5's
  // excess-property check while preserving the shared runtime configuration.
  ...{ test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  } },
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: ['localhost', '9bc6509fb541.ngrok-free.app']
  },
  plugins: [
    react(),
    {
      name: 'localhost-chat-voice',
      apply: 'serve',
      configureServer(server) {
        // Read server-only variables explicitly. Never define/inject this key
        // into client code, VITE_* variables, or Amplify outputs.
        const env = loadEnv(server.config.mode, server.config.envDir, 'ELEVENLABS_');
        server.middlewares.use('/__local/chat-voice', createLocalVoiceMiddleware({
          apiKey: process.env.ELEVENLABS_API_KEY || env.ELEVENLABS_API_KEY || '',
          voiceId: process.env.ELEVENLABS_VOICE_ID || env.ELEVENLABS_VOICE_ID,
          voiceName: 'Aaron',
        }));
      },
    },
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // Precache the shell; fetch optional artwork and 3D physics on demand.
        globPatterns: ['**/*.{js,css,html,ico,woff2}', 'favicon.svg', 'images/workspace-nebula.svg'],
        globIgnores: ['**/DiceScene-*.js', '**/rapier-*.js'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [{
          urlPattern: ({ url, request, sameOrigin }) => sameOrigin && (
            request.destination === 'image' || /^\/assets\/(DiceScene|rapier)-.*\.js$/.test(url.pathname)
          ),
          handler: 'CacheFirst',
          options: {
            cacheName: 'brainincup-on-demand-v1',
            expiration: { maxEntries: 80, maxAgeSeconds: 30 * 24 * 60 * 60 },
            cacheableResponse: { statuses: [200] },
          },
        }],
      },
      includeAssets: ['brain-icon-192.png', 'brain-icon-512.png'],
      manifest: {
        name: 'Brain In Cup',
        short_name: 'BrainCup',
        description: 'AI consciousness simulation system',
        theme_color: '#080c1c',
        background_color: '#080c1c',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'brain-icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'brain-icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
});
