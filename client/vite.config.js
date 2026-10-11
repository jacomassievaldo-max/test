import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const api = 'http://localhost:4000';
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': api, '/uploads': api, '/demos': api } },
});
