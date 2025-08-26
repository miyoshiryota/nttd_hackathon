import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    allowedHosts: [
      '98a4d265e31a.ngrok-free.app', // ngrokで出たURLを追加
      'e2510b2c8c0b.ngrok-free.app',
      '32c4074d8362.ngrok-free.app'
    ],
  },
})
