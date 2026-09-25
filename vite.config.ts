import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { parse } from 'yaml'

// Registry files (registry/**/*.yaml) are imported as plain data.
function yaml(): Plugin {
  return {
    name: 'registry-yaml',
    transform(code, id) {
      if (!id.endsWith('.yaml')) return null
      return { code: `export default ${JSON.stringify(parse(code))}`, map: null }
    },
  }
}

// base must match the GitHub repository name for GitHub Pages
export default defineConfig({
  base: '/delivery-pulse/',
  plugins: [react(), yaml()],
})
