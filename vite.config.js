import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // exceljs (~930 kB) se carga solo al importar o exportar Excel.
    chunkSizeWarningLimit: 1000,
  },
  resolve: {
    alias: { '@': '/src' },
  },
})
