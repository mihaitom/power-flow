import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Library build → dist/ (the published npm package). The demo site has its own
// config in vite.config.ts.
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      name: 'PowerFlow',
      fileName: 'powerflow',
      formats: ['es', 'umd'],
    },
    // No external deps — @mdi/js icon paths are bundled in, so a single
    // <script> tag is enough in any framework or plain HTML.
  },
});
