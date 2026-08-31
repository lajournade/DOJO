import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true, // accessible depuis l'iPhone sur le reseau / le VPN
    proxy: { '/api': 'http://localhost:5180' },
  },
  build: { target: 'es2022' },
});
