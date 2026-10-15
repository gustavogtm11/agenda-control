import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  // EVOLUTION_API_KEY fica somente no ambiente do servidor de desenvolvimento.
  // Não use prefixo VITE_ para segredos.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.png', 'pwa-512x512.png', 'firebase-messaging-sw.js'],
        manifest: {
          name: 'Sistema de Agendamentos',
          short_name: 'Gestão Inteligente',
          theme_color: '#ffffff',
          background_color: '#ffffff',
          display: 'standalone',
          icons: [
            { src: 'favicon.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          ],
        },
        devOptions: { enabled: true, type: 'module' },
        workbox: {
          importScripts: ['https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js'],
          globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm}'],
          cleanupOutdatedCaches: true,
          navigateFallbackDenylist: [/^\/_/, /firestore\.googleapis\.com/, /firebase-messaging-sw\.js$/],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
              handler: 'NetworkOnly',
              options: { cacheName: 'firebase-firestore' },
            },
            {
              urlPattern: /^https:\/\/securetoken\.googleapis\.com\/.*/i,
              handler: 'NetworkOnly',
              options: { cacheName: 'firebase-auth' },
            },
          ],
        },
      }),
    ],
    server: {
      proxy: {
        '/api/evolution': {
          target: env.EVOLUTION_API_URL || 'https://evolution-api-free-test.onrender.com',
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/evolution/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              if (env.EVOLUTION_API_KEY) {
                proxyReq.setHeader('apikey', env.EVOLUTION_API_KEY);
              }
            });
          },
        },
      },
    },
  };
});
