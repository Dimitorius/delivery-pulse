import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base must match the GitHub repository name for GitHub Pages
export default defineConfig({
  base: '/delivery-pulse/',
  plugins: [react()],
})
