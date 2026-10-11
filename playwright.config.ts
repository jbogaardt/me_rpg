import { defineConfig } from '@playwright/test';

// Browser smoke tests against the production build. In CI Playwright downloads its own Chromium; locally you
// can point PW_CHROMIUM at an installed one (e.g. /opt/pw-browsers/chromium in cloud sessions).
const executablePath = process.env.PW_CHROMIUM || undefined;

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    launchOptions: {
      executablePath,
      // Software GL so WebGL works in headless CI. The mDNS flag keeps WebRTC host candidates as plain IPs, so the
      // two-player test can connect two contexts on one machine without a multicast resolver.
      args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-features=WebRtcHideLocalIpsWithMdns'],
    },
  },
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
