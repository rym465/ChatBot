import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { DEFAULT_LANDING_LOGO_CDN } from './src/brandMark.js'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const landingLogoUrl =
    (env.VITE_LANDING_LOGO_URL && String(env.VITE_LANDING_LOGO_URL).trim()) ||
    DEFAULT_LANDING_LOGO_CDN

  return {
    plugins: [
      react(),
      {
        name: 'inject-landing-logo-meta',
        transformIndexHtml(html) {
          return html.replace(/%LANDING_LOGO_URL%/g, landingLogoUrl)
        },
      },
    ],
    server: {
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
          timeout: 300000,
          proxyTimeout: 300000,
        },
      },
    },
  }
})
