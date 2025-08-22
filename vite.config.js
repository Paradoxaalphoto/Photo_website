import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Replace base with your repo name when deploying to GitHub Pages
export default defineConfig({
  plugins: [react()],
  base: '/yorn/', // <-- change to '/<your-repo-name>/'
})