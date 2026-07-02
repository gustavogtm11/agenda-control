import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // 👇 ESTA É A LINHA MÁGICA QUE ATIVA O PWA NO LOCALHOST
      devOptions: {
        enabled: true 
      },
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'SaaS Gestão Pro',
        short_name: 'SaaS Pro',
        description: 'Plataforma completa de gestão e agendamentos',
        theme_color: '#2c3e50',
        background_color: '#f5f6fa',
        display: 'standalone', // Faz abrir em tela cheia, como um app nativo
        icons: [
          {
            src: 'https://cdn-icons-png.flaticon.com/512/272/272473.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'https://cdn-icons-png.flaticon.com/512/272/272473.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
})