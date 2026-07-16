import { defineConfig } from 'vite';
import { resolve } from 'path';
import pkg from './package.json';

export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
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
    // Game + engine ship in one main chunk; maps/units are already split via manualChunks.
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        editor: resolve(__dirname, 'map-editor.html'),
      },
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, '/');
          if (normalizedId.includes('/assets/maps/')) return 'maps';
          if (normalizedId.includes('/assets/units/')) return 'units';
          // Split large, cohesive subsystems into their own chunks so they can be
          // cached independently of the frequently-changing core game logic.
          if (normalizedId.includes('/src/audio/')) return 'audio';
          if (normalizedId.includes('/src/editor/')) return 'editor';
          if (normalizedId.includes('/src/ui/TacticalBattleUI')) return 'tactical';
        },
      },
    },
  },
});
