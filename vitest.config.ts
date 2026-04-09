import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import rsc from '@vitejs/plugin-rsc'
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
  },
  plugins: [rsc(), rscTestingPlugin()],
  environments: {
    rsc: {
      build: {
        rollupOptions: {
          input: {
            index: './rsc/entry.rsc.tsx',
          },
        },
      },
    },
    ssr: {
      build: {
        rollupOptions: {
          input: {
            index: './rsc/entry.ssr.tsx',
          },
        },
      },
    },
    client: {
      build: {
        rollupOptions: {
          input: {
            index: './rsc/entry.browser.tsx',
          },
        },
      },
    },
  },
})
