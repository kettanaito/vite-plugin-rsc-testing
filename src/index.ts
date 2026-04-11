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
import { parse } from '@babel/parser'
import type * as t from '@babel/types'

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

function renderImport(
  specifiers: t.ImportDeclaration['specifiers'],
  source: string,
): string {
  const defaultSpec = specifiers.find(
    (s): s is t.ImportDefaultSpecifier => s.type === 'ImportDefaultSpecifier',
  )
  const namespaceSpec = specifiers.find(
    (s): s is t.ImportNamespaceSpecifier =>
      s.type === 'ImportNamespaceSpecifier',
  )
  const namedSpecs = specifiers.filter(
    (s): s is t.ImportSpecifier => s.type === 'ImportSpecifier',
  )

  const parts: string[] = []
  if (defaultSpec) parts.push(defaultSpec.local.name)
  if (namespaceSpec) parts.push(`* as ${namespaceSpec.local.name}`)
  if (namedSpecs.length > 0) {
    parts.push(
      `{ ${namedSpecs
        .map((s) => {
          const imported =
            s.imported.type === 'Identifier'
              ? s.imported.name
              : s.imported.value
          return imported === s.local.name
            ? s.local.name
            : `${imported} as ${s.local.name}`
        })
        .join(', ')} }`,
    )
  }

  return `import ${parts.join(', ')} from ${JSON.stringify(source)};`
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

          const [componentFileName, componentExportName] =
            componentPath.split('#')

          try {
            const componentModule =
              await rscEnvironment.runner.import(componentFileName)
            const Component = componentModule[componentExportName]

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
      name: 'rsc-testing-plugin:transform-test-file',
      enforce: 'pre',
      applyToEnvironment(environment) {
        return environment.name === 'client'
      },
      async transform(code, id) {
        if (!/\.test\.[cm]?[jt]sx?(\?.*)?$/.test(id)) {
          return
        }

        if (id.includes('/node_modules/')) {
          return
        }

        const ast = parse(code, {
          sourceType: 'module',
          plugins: ['typescript', 'jsx'],
          errorRecovery: true,
        })

        const importDecls = ast.program.body.filter(
          (n): n is t.ImportDeclaration => n.type === 'ImportDeclaration',
        )

        const localToImported = new Map<string, string>()
        for (const decl of importDecls) {
          for (const spec of decl.specifiers) {
            if (spec.type === 'ImportDefaultSpecifier') {
              localToImported.set(spec.local.name, 'default')
            } else if (spec.type === 'ImportSpecifier') {
              const imported =
                spec.imported.type === 'Identifier'
                  ? spec.imported.name
                  : spec.imported.value
              localToImported.set(spec.local.name, imported)
            }
          }
        }

        interface DynamicImport {
          source: string
          patternStart: number
          patternEnd: number
          properties: Array<{ imported: string; local: string }>
        }
        const dynamicImports: DynamicImport[] = []

        const usedAsComponent = new Set<string>()

        const walk = (node: unknown, parents: t.Node[]): void => {
          if (node === null || typeof node !== 'object') return
          if (Array.isArray(node)) {
            for (const child of node) walk(child, parents)
            return
          }
          const n = node as t.Node & Record<string, unknown>

          if (n.type === 'JSXOpeningElement') {
            const name = (n as unknown as t.JSXOpeningElement).name
            let root: t.JSXIdentifier | null = null
            if (name.type === 'JSXIdentifier') {
              root = name
            } else if (name.type === 'JSXMemberExpression') {
              let cursor: t.JSXMemberExpression | t.JSXIdentifier = name
              while (cursor.type === 'JSXMemberExpression') {
                cursor = cursor.object
              }
              root = cursor
            }
            if (root && localToImported.has(root.name)) {
              usedAsComponent.add(root.name)
            }
          }

          if (
            n.type === 'CallExpression' &&
            (n as unknown as t.CallExpression).callee.type === 'Import'
          ) {
            const call = n as unknown as t.CallExpression
            const arg = call.arguments[0]
            const declarator = parents.findLast(
              (p): p is t.VariableDeclarator =>
                p.type === 'VariableDeclarator',
            )
            if (
              arg?.type === 'StringLiteral' &&
              declarator &&
              declarator.id.type === 'ObjectPattern' &&
              declarator.id.start != null &&
              declarator.id.end != null
            ) {
              const properties: DynamicImport['properties'] = []
              for (const prop of declarator.id.properties) {
                if (prop.type !== 'ObjectProperty') continue
                if (prop.key.type !== 'Identifier') continue
                if (prop.value.type !== 'Identifier') continue
                properties.push({
                  imported: prop.key.name,
                  local: prop.value.name,
                })
                localToImported.set(prop.value.name, prop.key.name)
              }
              if (properties.length > 0) {
                dynamicImports.push({
                  source: arg.value,
                  patternStart: declarator.id.start,
                  patternEnd: declarator.id.end,
                  properties,
                })
              }
            }
          }

          const nextParents = [...parents, n]
          for (const key of Object.keys(n)) {
            if (key === 'loc' || key === 'start' || key === 'end') continue
            walk(n[key], nextParents)
          }
        }
        walk(ast.program, [])

        if (usedAsComponent.size === 0) {
          return
        }

        const edits: Array<{ start: number; end: number; text: string }> = []
        const stubsByLocal = new Map<string, string>()

        for (const dyn of dynamicImports) {
          const kept: Array<{ imported: string; local: string }> = []
          const removed: Array<{ imported: string; local: string }> = []
          for (const prop of dyn.properties) {
            if (usedAsComponent.has(prop.local)) removed.push(prop)
            else kept.push(prop)
          }
          if (removed.length === 0) continue

          const resolved = await this.resolve(dyn.source, id)
          const resolvedId = resolved?.id ?? dyn.source
          for (const r of removed) {
            const path = `${resolvedId}#${r.imported}`
            stubsByLocal.set(
              r.local,
              `const ${r.local} = () => null; ${r.local}.__componentPath = ${JSON.stringify(path)};`,
            )
          }

          const keptText = kept
            .map((p) =>
              p.imported === p.local ? p.imported : `${p.imported}: ${p.local}`,
            )
            .join(', ')
          edits.push({
            start: dyn.patternStart,
            end: dyn.patternEnd,
            text: `{ ${keptText} }`,
          })
        }

        for (const decl of importDecls) {
          if (decl.start == null || decl.end == null) {
            continue
          }

          const keepSpecifiers: t.ImportDeclaration['specifiers'] = []
          const removedForStubs: Array<{ local: string; imported: string }> = []

          for (const spec of decl.specifiers) {
            if (
              spec.type === 'ImportDefaultSpecifier' &&
              usedAsComponent.has(spec.local.name)
            ) {
              removedForStubs.push({
                local: spec.local.name,
                imported: 'default',
              })
            } else if (
              spec.type === 'ImportSpecifier' &&
              usedAsComponent.has(spec.local.name)
            ) {
              const imported =
                spec.imported.type === 'Identifier'
                  ? spec.imported.name
                  : spec.imported.value
              removedForStubs.push({
                local: spec.local.name,
                imported,
              })
            } else {
              keepSpecifiers.push(spec)
            }
          }

          if (removedForStubs.length === 0) {
            continue
          }

          const resolved = await this.resolve(decl.source.value, id)
          const resolvedId = resolved?.id ?? decl.source.value
          for (const r of removedForStubs) {
            const path = `${resolvedId}#${r.imported}`
            stubsByLocal.set(
              r.local,
              `const ${r.local} = () => null; ${r.local}.__componentPath = ${JSON.stringify(path)};`,
            )
          }

          const rebuilt = keepSpecifiers.length
            ? renderImport(keepSpecifiers, decl.source.value)
            : ''
          edits.push({ start: decl.start, end: decl.end, text: rebuilt })
        }

        if (stubsByLocal.size === 0) return

        edits.sort((a, b) => b.start - a.start)
        let next = code
        for (const edit of edits) {
          next = next.slice(0, edit.start) + edit.text + next.slice(edit.end)
        }
        next = `${next}\n${[...stubsByLocal.values()].join('\n')}\n`

        return { code: next, map: null }
      },
    },
  ]
}
