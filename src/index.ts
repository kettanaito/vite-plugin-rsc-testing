import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import type { PluginOption } from 'vite'
import { isRunnableDevEnvironment } from 'vite'
import rsc from '@vitejs/plugin-rsc'

const RSC_SETUP_PATH = fileURLToPath(new URL('./rsc-setup.ts', import.meta.url))

import type React from 'react'
import type { ReactFormState } from 'react-dom/client'

export type RscPayload = {
  root: React.ReactNode
  returnValue?: {
    ok: boolean
    data: unknown
  }
  formState?: ReactFormState
}

export function rscTestingPlugin(): PluginOption {
  return [
    rsc({
      // serverHandler: false,
      entries: {
        rsc: 'noop.js',
        ssr: 'noop.js',
        client: 'noop.js',
      },
    }),
    {
      name: 'rsc-testing-plugin:rsc-middleware',
      async configureServer(server) {
        const rscEnvironment = server.environments['rsc']

        server.middlewares.use(async (req, res, next) => {
          const url = new URL(req.url ?? '/', 'http://localhost')

          if (url.pathname !== '/__rsc') {
            return next()
          }

          if (!rscEnvironment || !isRunnableDevEnvironment(rscEnvironment)) {
            res.statusCode = 500
            res.end('RSC environment not available')
            return
          }

          const componentPath = url.searchParams.get('component')
          if (!componentPath) {
            res.statusCode = 400
            res.end('Missing "component" search parameter')
            return
          }

          try {
            const componentModule =
              await rscEnvironment.runner.import(componentPath)
            const { default: Component } = componentModule

            const {
              createTemporaryReferenceSet,
              decodeReply,
              decodeAction,
              decodeFormState,
              loadServerAction,
              renderToReadableStream,
            } = (await rscEnvironment.runner.import(
              RSC_SETUP_PATH,
            )) as typeof import('./rsc-setup')

            let returnValue: RscPayload['returnValue']
            let formState: ReactFormState | undefined
            let temporaryReferences: unknown | undefined

            // Server actions.
            if (req.method === 'POST') {
              const request = new Request(url, {
                method: req.method,
                headers: req.headers,
                duplex: 'half',
                body: Readable.toWeb(req),
              })

              const actionId = request.headers.get('x-rsc-action')

              if (typeof actionId === 'string') {
                const contentType = request.headers.get('content-type')
                const body = contentType?.startsWith('multipart/form-data')
                  ? await request.formData()
                  : await request.text()

                temporaryReferences = createTemporaryReferenceSet()
                const args = await decodeReply(body, { temporaryReferences })
                const action = await loadServerAction(actionId)

                try {
                  const data = await action.apply(null, args)
                  returnValue = { ok: true, data }
                } catch (error) {
                  returnValue = { ok: false, data: error }
                }
              } else {
                const formData = await request.formData()
                const decodedAction = await decodeAction(formData)
                const result = await decodedAction()
                formState = await decodeFormState(result, formData)
              }
            }

            res.statusCode = returnValue?.ok === false ? 500 : 200
            res.setHeader('Content-Type', 'text/x-component;charset=utf-8')
            res.setHeader('Content-Encoding', 'chunked')

            const rscPayload: RscPayload = {
              root: Component(),
              formState,
              returnValue,
            }
            const stream = renderToReadableStream(rscPayload, {
              temporaryReferences,
            })
            Readable.fromWeb(stream).pipe(res)
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
