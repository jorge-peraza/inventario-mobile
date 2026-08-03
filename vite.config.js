import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Ruta base para GitHub Pages (https://<usuario>.github.io/inventario-nogales/)
  base: '/inventario-nogales/',
  plugins: [
    react(),
    tailwindcss(),
  ],
})