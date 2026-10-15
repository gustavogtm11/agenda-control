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
      configureServer(server) {
        // Intercepta a configuração do webhook para injetar a URL somente no servidor local.
        // Assim o segredo do webhook e a chave Evolution não entram no bundle React.
        server.middlewares.use('/api/evolution/webhook/set', async (req, res, next) => {
          if (req.method !== 'POST') return next();
          const instanceName = String(req.url || '').split('?')[0].replace(/^\/+/, '');
          if (!/^[a-zA-Z0-9_-]{1,100}$/.test(instanceName)) return next();
          if (!env.WHATSAPP_WEBHOOK_URL) {
            res.statusCode = 503;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: 'Configure WHATSAPP_WEBHOOK_URL no .env.local para ativar o recebimento de mensagens.' }));
            return;
          }

          try {
            const chunks = [];
            for await (const chunk of req) chunks.push(Buffer.from(chunk));
            const target = String(env.EVOLUTION_API_URL || 'https://evolution-api-free-test.onrender.com').replace(/\/$/, '');
            const upstream = await fetch(`${target}/webhook/set/${encodeURIComponent(instanceName)}`, {
              method: 'POST',
              headers: {
                apikey: env.EVOLUTION_API_KEY || '',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                enabled: true,
                url: env.WHATSAPP_WEBHOOK_URL,
                webhookByEvents: false,
                webhookBase64: false,
                events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE'],
              }),
            });
            const responseText = await upstream.text();
            res.statusCode = upstream.status;
            res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
            res.end(responseText || '{}');
          } catch (error) {
            console.error('[Vite Evolution webhook proxy]', error);
            res.statusCode = 502;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: 'Não foi possível configurar o webhook da Evolution API.' }));
          }
        });
      },
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
