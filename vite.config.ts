import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@engine': resolve(__dirname, 'src/engine'),
      '@data': resolve(__dirname, 'src/data'),
      '@renderer': resolve(__dirname, 'src/renderer'),
      '@ui': resolve(__dirname, 'src/ui'),
      '@editor': resolve(__dirname, 'src/editor'),
    },
  },
  server: {
    port: 19123,
    strictPort: true,
    open: false,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        editor: resolve(__dirname, 'map-editor.html'),
      },
    },
  },
});







