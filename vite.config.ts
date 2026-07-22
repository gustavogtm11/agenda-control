import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      
      // 1. REGISTRA O ARQUIVO COMO UM ATIVO ESTÁTICO DO PWA
      includeAssets: ['favicon.png', 'pwa-512x512.png', 'firebase-messaging-sw.js'],
      
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

        // 2. IMPEDE O WORKBOX DE ENTREGAR O index.html NO LUGAR DO SERVICE WORKER DO FIREBASE
        navigateFallbackDenylist: [
          /^\/_/, 
          /firestore\.googleapis\.com/,
          /firebase-messaging-sw\.js$/ // 👈 ADICIONADO AQUI!
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