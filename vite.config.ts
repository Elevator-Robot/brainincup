import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: ['localhost', 'b2b7-136-62-118-167.ngrok-free.app']
  },
  plugins: [react()],
})
