import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      reportsDirectory: './coverage',
      thresholds: {
        statements: 70,
        branches: 70,
        functions: 65,
        lines: 70,
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
      '/media': 'http://localhost:8080',
    },
  },
})
