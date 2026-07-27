import { defineConfig } from 'vite';

// Demo / playground site build → dist-site/ (e.g. for GitHub Pages). The
// publishable library has its own config in vite.config.lib.ts.
export default defineConfig({
  base: '/power-flow/',
  build: {
    outDir: 'dist-site',
    emptyOutDir: true,
  },
});
