import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'avr8js': path.resolve(__dirname, '../wokwi-libs/avr8js/dist/esm'),
      '@wokwi/elements': path.resolve(__dirname, '../wokwi-libs/wokwi-elements/dist/esm'),
    },
  },
  optimizeDeps: {
    include: ['avr8js', '@wokwi/elements'],
  },
})
