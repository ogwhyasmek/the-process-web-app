import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The dev server forwards /api to the local proxy so the browser only ever
// talks to one origin — and never to a market-data provider directly.
export default defineConfig({
  plugins: [react()],
  // dexie-react-hooks must share the app's React instance — without the
  // dedupe, Vite's pre-bundle gives it a second copy and hooks crash.
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'dexie', 'dexie-react-hooks'],
  },
  server: {
    port: 4610,
    proxy: {
      '/api': 'http://127.0.0.1:4600',
    },
  },
});
