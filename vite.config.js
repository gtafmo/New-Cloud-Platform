import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite' // 必须导入

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(), // 必须激活
  ],
})