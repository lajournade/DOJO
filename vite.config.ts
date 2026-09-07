import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true, // accessible depuis l'iPhone sur le reseau / le VPN
    // Port fige : Comptes tient le 5173, et un glissement silencieux sur un port libre
    // changerait l'URL sous les pieds du telephone. Mieux vaut echouer bruyamment.
    port: 5174,
    strictPort: true,
    proxy: { '/api': 'http://localhost:5180' },
  },
  build: { target: 'es2022' },
});
