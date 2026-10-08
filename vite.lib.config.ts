import { defineConfig } from 'vite';

/**
 * The LIBRARY build, for a game system that embeds Invisi-Rolls (src/index.ts). Separate from the
 * module build because it has a different entry and ships its CSS inside the JS: a system bundles
 * this into its own code and has no stylesheet slot for a dependency.
 */
export default defineConfig({
  build: {
    lib: { entry: 'src/index.ts', formats: ['es'], fileName: () => 'index.js' },
    outDir: 'dist/lib',
    emptyOutDir: true,
    minify: false,
    target: 'es2022',
  },
});
