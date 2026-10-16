import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      
      // Mantém os arquivos estáticos necessários para instalação do PWA.
      includeAssets: ['favicon.png', 'pwa-512x512.png'],
      
      manifest: {
        name: 'Sistema de Agendamentos',
        short_name: 'Gestão Inteligente',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        icons:[
          {
            src: 'favicon.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },

      devOptions: {
        enabled: true,
        type: 'module',
      },
      
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm}'],
        cleanupOutdatedCaches: true,

        // 2. IMPEDE O WORKBOX DE ENTREGAR O index.html NO LUGAR DOS SERVICE WORKERS
        navigateFallbackDenylist: [
          /^\/_/, 
          /firestore\.googleapis\.com/
        ],
        
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
            handler: 'NetworkOnly',
            options: {
              cacheName: 'firebase-firestore',
            },
          },
          {
            urlPattern: /^https:\/\/securetoken\.googleapis\.com\/.*/i,
            handler: 'NetworkOnly',
            options: {
              cacheName: 'firebase-auth',
            },
          }
        ],
      },
    }),
  ],
});