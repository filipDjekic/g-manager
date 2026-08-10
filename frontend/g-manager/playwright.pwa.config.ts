import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e-pwa',
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4174', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4174',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: false,
  },
  projects: [{ name: 'pwa-chromium', use: { ...devices['Desktop Chrome'] } }],
})
