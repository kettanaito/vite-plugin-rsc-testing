import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import { rscTestingPlugin } from './src'

export default defineConfig({
  test: {
    globals: true,
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
      headless: true,
    },
    testTimeout: 5000,
  },
  plugins: [rscTestingPlugin()],
})
