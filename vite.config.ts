import { defineConfig } from 'vitest/config';
import { assetVersionsPlugin } from './tools/assetVersions';

// Relative base so the build works under https://<user>.github.io/<repo>/
export default defineConfig({
  base: './',
  // Identifies this build for the co-op version handshake (asset URLs use content versions instead, see the plugin).
  define: { __BUILD_ID__: JSON.stringify(Date.now().toString(36)) },
  plugins: [assetVersionsPlugin()],
  test: {
    // Unit tests cover the Pixi-free logic (rules, collision, camera, map format, map checks).
    include: ['src/**/*.test.ts', 'tools/**/*.test.ts'],
    environment: 'node',
  },
});
