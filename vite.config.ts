import { defineConfig } from 'vite';

// Relative base so the build works under https://<user>.github.io/<repo>/
export default defineConfig({
  base: './',
  define: { __BUILD_ID__: JSON.stringify(Date.now().toString(36)) },
});
