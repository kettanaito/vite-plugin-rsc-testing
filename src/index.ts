/// <reference types="vitest/config" />
import { type IncomingMessage } from 'node:http'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'
import { text } from 'node:stream/consumers'
import { isRunnableDevEnvironment, type PluginOption } from 'vite'
import rsc from '@vitejs/plugin-rsc'
import type { VitestPluginContext } from 'vitest/node'
import type React from 'react'
import type { ReactFormState } from 'react-dom/client'

const RSC_SETUP_PATH = fileURLToPath(new URL('./rsc-setup.ts', import.meta.url))
const TEST_SETUP_PATH = fileURLToPath(
  new URL('./test-setup.ts', import.meta.url),
)

export type RscPayload = {
  root: React.ReactNode
  returnValue?: {
    ok: boolean
    data: unknown
  }
  formState?: ReactFormState
}

function formData(message: IncomingMessage): Promise<FormData> {
  return new Response(Readable.toWeb(message), {
    headers: { 'content-type': message.headers['content-type'] },
  }).formData()
}

export function rscTestingPlugin(): PluginOption {
  return [
    rsc({
      entries: {
        rsc: 'noop.js',
        ssr: 'noop.js',
        client: 'noop.js',
      },
    }),
    {
      name: 'rsc-testing-plugin:vitest-hooks',
      configureVitest(context: VitestPluginContext) {
        const setupFiles = Array.prototype.concat(
          [],
          context.project.config.setupFiles || [],
        )

        if (!setupFiles.includes(TEST_SETUP_PATH)) {
          setupFiles.push(TEST_SETUP_PATH)
          context.project.config.setupFiles = setupFiles
        }
      },
    },
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

          /**
           * @note Invalidate the component module imports.
           * This request is fired in the "beforeEach" hook inserted by this plugin.
           * This makes sure that the imported modules' state is preserved within the test case
           * but reset before the new run.
           */
          const clearCacheFlag = url.searchParams.get('clearCache')
          if (clearCacheFlag === '1') {
            rscEnvironment.moduleGraph.invalidateAll()
            rscEnvironment.runner.evaluatedModules.clear()

            res.statusCode = 200
            res.end()
            return
          }

          const componentPath = url.searchParams.get('c')
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
              const actionId = req.headers['x-rsc-action']

              if (typeof actionId === 'string') {
                const contentType = req.headers['content-type']
                const body = contentType?.startsWith('multipart/form-data')
                  ? await formData(req)
                  : await text(req)

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
                const body = await formData(req)
                const decodedAction = await decodeAction(body)
                const result = await decodedAction()
                formState = await decodeFormState(result, body)
              }
            }

            res.statusCode = returnValue?.ok === false ? 500 : 200
            res.setHeader('Content-Type', 'text/x-component;charset=utf-8')
            res.setHeader('Content-Encoding', 'chunked')

            const componentProps = JSON.parse(url.searchParams.get('p') || '{}')
            const rscPayload: RscPayload = {
              root: Component(componentProps),
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
stub.__componentPath = ${JSON.stringify(id)};
export default stub;
`,
          map: null,
        }
      },
    },
  ]
}
