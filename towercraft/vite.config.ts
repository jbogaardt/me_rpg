import { defineConfig } from 'vite';

// Towercraft is one page of the site (tools/site.ts adds the gallery round it): it builds into dist/towercraft.
export default defineConfig({
  root: import.meta.dirname,
  base: './',
  build: { outDir: '../dist/towercraft', emptyOutDir: true },
});
