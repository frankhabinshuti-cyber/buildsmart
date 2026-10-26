import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// During development the browser talks to Vite (port 5173); Vite forwards /api calls to the backend (port 4000).
// This keeps everything on one origin, so no CORS setup is needed in development.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: true } } },
});
