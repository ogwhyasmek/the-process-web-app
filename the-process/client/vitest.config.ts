import { defineConfig } from 'vitest/config';

// Tests cover the pure logic in src/lib (formulas, grading, signals,
// analytics) — no React rendering — so they run in plain Node and don't
// need the app's Vite plugins.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
