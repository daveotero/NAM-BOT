import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/desktop',
  outputDir: './test-results/desktop-shell',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
})
