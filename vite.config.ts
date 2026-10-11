import { defineConfig } from 'vitest/config';

// Relative base so the build works under https://<user>.github.io/<repo>/
export default defineConfig({
  base: './',
  define: { __BUILD_ID__: JSON.stringify(Date.now().toString(36)) },
  test: {
    // Unit tests cover the Pixi-free logic (rules, collision, camera, map format, map checks).
    include: ['src/**/*.test.ts', 'tools/**/*.test.ts'],
    environment: 'node',
  },
});
