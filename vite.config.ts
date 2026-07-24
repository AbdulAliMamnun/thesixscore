import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** Inject Plausible only when VITE_PLAUSIBLE_DOMAIN is set; otherwise skip entirely. */
function plausibleInject(domain: string | undefined): Plugin {
  return {
    name: 'plausible-inject',
    transformIndexHtml(html) {
      const d = domain?.trim()
      if (!d) return html
      const tag = `<script defer data-domain="${d}" src="https://plausible.io/js/script.js"></script>`
      return html.replace('</head>', `    ${tag}\n  </head>`)
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), tailwindcss(), plausibleInject(env.VITE_PLAUSIBLE_DOMAIN)],
  }
})
