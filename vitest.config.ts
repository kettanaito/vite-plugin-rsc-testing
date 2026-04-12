import { defineConfig, defaultExclude } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import { rscTestingPlugin } from './src'

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 5000,
    projects: [
      {
        extends: true,
        plugins: [rscTestingPlugin()],
        test: {
          name: 'browser',
          exclude: [...defaultExclude, '**/*.node.test.ts'],
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
            headless: true,
          },
        },
      },
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['**/*.node.test.ts'],
        },
      },
    ],
  },
})
