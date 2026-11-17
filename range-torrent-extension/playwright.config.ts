/**
 * End-to-end tests (ARCHITECTURE §4): the production Chrome build
 * (.output/chrome-mv3) in Playwright's Chromium, against the scratch rqbit.
 * Run them with `.pi/scripts/tv e2e`, which builds, seeds the samples and
 * passes their hashes; `bun test` doesn't pick up `*.e2e.ts`.
 */

import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.e2e.ts',
  outputDir: '.e2e-results',
  // One browser at a time: the tests share one rqbit.
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: 'list',
})
