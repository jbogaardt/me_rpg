import { defineConfig } from 'vitest/config';
import { assetVersionsPlugin } from './tools/assetVersions';

// Relative base so the build works under https://<user>.github.io/<repo>/
export default defineConfig({
  base: './',
  // Identifies this build for the co-op version handshake (asset URLs use content versions instead, see the plugin).
  define: { __BUILD_ID__: JSON.stringify(Date.now().toString(36)) },
  plugins: [assetVersionsPlugin()],
  // The speech model's thread (src/hud/kokoroWorker.ts) imports code-split packages, which needs module workers.
  worker: { format: 'es' },
  test: {
    // Unit tests cover the Pixi-free logic (rules, collision, camera, map format, map checks).
    include: ['src/**/*.test.ts', 'tools/**/*.test.ts', 'server/**/*.test.ts'],
    environment: 'node',
    // The content (public/content/*.json) is installed before every test file, as main.ts does at boot.
    setupFiles: ['tools/content/setup.ts'],
  },
});
