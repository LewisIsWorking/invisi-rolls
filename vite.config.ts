import { defineConfig } from 'vite';

/**
 * One ES module and one stylesheet, with names pinned: module.json lists them by name, and if they
 * drift Foundry silently loads nothing.
 */
export default defineConfig({
  build: {
    lib: { entry: 'src/main.ts', formats: ['es'], fileName: () => 'invisi-rolls.js' },
    cssCodeSplit: false,
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    // Unminified: the bundle is tiny and readable stack traces are worth more.
    minify: false,
    target: 'es2022',
    rollupOptions: { output: { assetFileNames: 'invisi-rolls.[ext]' } },
  },
});
