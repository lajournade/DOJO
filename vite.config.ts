import { defineConfig } from 'vitest/config';
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
  test: {
    // Node par defaut ; les tests qui rendent l'interface le disent en tete de fichier
    // (`@vitest-environment jsdom`), comme dans Comptes.
    environment: 'node',
    setupFiles: ['src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**', 'shared/**', 'server/**'],
      // sprites.ts est un tableau de pixels, main.tsx et server/index.mjs de l'amorcage :
      // rien a y verifier, et ils fausseraient le seuil dans un sens ou dans l'autre.
      exclude: [
        'src/fx/sprites.ts',
        'src/main.tsx',
        'server/index.mjs',
        'src/test/**',
        'src/conops/**',
        '**/*.test.*',
        '**/*.d.ts',
      ],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
