import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// PAU OS web client. Talks to services/api (default http://localhost:3000).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173 },
});
