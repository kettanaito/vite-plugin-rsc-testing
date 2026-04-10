import type { PluginOption } from 'vite'
import { isRunnableDevEnvironment } from 'vite'
import rsc from '@vitejs/plugin-rsc'

export function rscTestingPlugin(): PluginOption {
  return [
    rsc({
      serverHandler: false,
    }),
    {
      name: 'rsc-testing-plugin:rsc-middleware',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const url = new URL(req.url ?? '/', 'http://localhost')

          if (url.pathname !== '/__rsc') {
            return next()
          }

          const componentPath = url.searchParams.get('component')
          if (!componentPath) {
            res.statusCode = 400
            res.end('Missing "component" search parameter')
            return
          }

          const rscEnvironment = server.environments['rsc']
          if (!rscEnvironment || !isRunnableDevEnvironment(rscEnvironment)) {
            res.statusCode = 500
            res.end('RSC environment not available')
            return
          }

          try {
            const { renderToReadableStream } =
              (await rscEnvironment.runner.import(
                '@vitejs/plugin-rsc/rsc',
              )) as {
                renderToReadableStream: (
                  element: unknown,
                ) => ReadableStream<Uint8Array>
              }

            const mod = await rscEnvironment.runner.import(componentPath)
            const Component = mod.default

            const stream = renderToReadableStream(Component())

            res.setHeader('Content-Type', 'text/x-component;charset=utf-8')
            res.setHeader('Transfer-Encoding', 'chunked')

            const reader = stream.getReader()
            const push = async () => {
              while (true) {
                const { done, value } = await reader.read()
                if (done) {
                  res.end()
                  return
                }
                res.write(value)
              }
            }
            await push()
          } catch (error) {
            console.error('Error during RSC rendering:', error)

            res.statusCode = 500
            res.end(
              error instanceof Error ? error.message : 'RSC render failed',
            )
          }
        })
      },
    },
    {
      name: 'rsc-testing-plugin:transform-import',
      applyToEnvironment(environment) {
        return environment.name === 'client'
      },
      transform(code, id) {
        if (id.includes('/node_modules/') || id.startsWith('\0')) {
          return
        }

        if (!/\.[tjm]sx?$/.test(id)) {
          return
        }

        const trimmed = code.trimStart()
        if (
          trimmed.startsWith("'use client'") ||
          trimmed.startsWith('"use client"')
        ) {
          return
        }

        if (
          !code.includes('export default') &&
          !code.includes('export { default')
        ) {
          return
        }

        return {
          code: `
const stub = () => null;
stub.__rscPath = ${JSON.stringify(id)};
export default stub;
`,
          map: null,
        }
      },
    },
  ]
}
