import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          map: ['leaflet', 'react-leaflet'],
          supabase: ['@supabase/supabase-js']
        }
      }
    }
  }
})
