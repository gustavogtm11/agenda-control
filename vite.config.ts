import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      
      // Aqui pode manter as configurações do seu manifest (ícones, nome, etc)
      // Se já tinha um bloco "manifest: { ... }", pode colá-lo aqui.
      manifest: {
        name: 'Sistema de Agendamentos',
        short_name: 'Agendamentos',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
      },

      // 1. RESOLVE O ERRO DE MIME TYPE NO MODO DEV (text/html)
      // Permite que o Vite gere o sw.js corretamente quando corre no localhost
      devOptions: {
        enabled: true,
        type: 'module',
      },
      
      workbox: {
        // 2. SILENCIA O AVISO DO TERMINAL (Glob)
        // Ignora ficheiros que não existem na pasta temporária durante o desenvolvimento
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm}'],
        cleanupOutdatedCaches: true,

        // 3. RESOLVE O SPAM DO FIRESTORE NO CONSOLE
        // Diz ao Workbox para não tentar intercetar a ligação em tempo real do Firebase
        navigateFallbackDenylist: [/^\/_/, /firestore\.googleapis\.com/],
        runtimeCaching: [
          {
            // Captura as requisições do Firebase Firestore e obriga a usar apenas a rede
            urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
            handler: 'NetworkOnly',
            options: {
              cacheName: 'firebase-firestore',
            },
          },
          {
            // Tratamento idêntico para a API de Autenticação do Google
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