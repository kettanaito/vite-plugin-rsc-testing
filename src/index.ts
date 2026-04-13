/// <reference types="vitest/config" />
import { type IncomingMessage, type ServerResponse } from 'node:http'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'
import { text } from 'node:stream/consumers'
import { isRunnableDevEnvironment, type PluginOption } from 'vite'
import { EvaluatedModules } from 'vite/module-runner'
import rsc from '@vitejs/plugin-rsc'
import { createMockResolver, preseedMockedModules } from './rpc/server'
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

type ExportClassification =
  | { kind: 'component' }
  | { kind: 'literal'; valueStart: number; valueEnd: number }
  | { kind: 'unknown' }

function isLiteralInit(node: t.Node | null | undefined): boolean {
  if (!node) return false
  switch (node.type) {
    case 'StringLiteral':
    case 'NumericLiteral':
    case 'BooleanLiteral':
    case 'NullLiteral':
    case 'BigIntLiteral':
      return true
    case 'TemplateLiteral':
      return node.expressions.length === 0
    case 'UnaryExpression':
      return (
        (node.operator === '-' ||
          node.operator === '+' ||
          node.operator === '!') &&
        isLiteralInit(node.argument)
      )
    case 'ArrayExpression':
      return node.elements.every(
        (el) => el !== null && el.type !== 'SpreadElement' && isLiteralInit(el),
      )
    case 'ObjectExpression':
      return node.properties.every((p) => {
        if (p.type !== 'ObjectProperty') return false
        if (p.computed) return false
        if (
          p.key.type !== 'Identifier' &&
          p.key.type !== 'StringLiteral' &&
          p.key.type !== 'NumericLiteral'
        )
          return false
        return isLiteralInit(p.value as t.Node)
      })
  }
  return false
}

function isComponentCallExpression(node: t.CallExpression): boolean {
  const callee = node.callee
  if (callee.type === 'Identifier') {
    return callee.name === 'memo' || callee.name === 'forwardRef'
  }
  if (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object.type === 'Identifier' &&
    callee.object.name === 'React' &&
    callee.property.type === 'Identifier'
  ) {
    return (
      callee.property.name === 'memo' || callee.property.name === 'forwardRef'
    )
  }
  return false
}

function classifyExportInit(
  init: t.Node | null | undefined,
  localName: string,
): ExportClassification {
  if (!init) return { kind: 'unknown' }
  if (
    init.type === 'ArrowFunctionExpression' ||
    init.type === 'FunctionExpression'
  ) {
    return /^[A-Z]/.test(localName)
      ? { kind: 'component' }
      : { kind: 'unknown' }
  }
  if (init.type === 'CallExpression' && isComponentCallExpression(init)) {
    return { kind: 'component' }
  }
  if (isLiteralInit(init) && init.start != null && init.end != null) {
    return { kind: 'literal', valueStart: init.start, valueEnd: init.end }
  }
  return { kind: 'unknown' }
}

function collectModuleExports(ast: t.File): Map<string, ExportClassification> {
  const map = new Map<string, ExportClassification>()

  for (const node of ast.program.body) {
    if (node.type === 'ExportDefaultDeclaration') {
      const d = node.declaration
      if (d.type === 'FunctionDeclaration') {
        const name = d.id?.name ?? ''
        map.set(
          'default',
          /^[A-Z]/.test(name) ? { kind: 'component' } : { kind: 'unknown' },
        )
      } else if (d.type === 'ClassDeclaration') {
        map.set('default', { kind: 'unknown' })
      } else {
        map.set('default', classifyExportInit(d, 'Default'))
      }
      continue
    }

    if (node.type === 'ExportNamedDeclaration' && node.declaration) {
      const d = node.declaration
      if (d.type === 'FunctionDeclaration' && d.id) {
        const name = d.id.name
        map.set(
          name,
          /^[A-Z]/.test(name) ? { kind: 'component' } : { kind: 'unknown' },
        )
      } else if (d.type === 'VariableDeclaration') {
        for (const decl of d.declarations) {
          if (decl.id.type !== 'Identifier') continue
          map.set(decl.id.name, classifyExportInit(decl.init, decl.id.name))
        }
      } else if (d.type === 'ClassDeclaration' && d.id) {
        map.set(d.id.name, { kind: 'unknown' })
      }
    }
  }

  return map
}

function formData(message: IncomingMessage): Promise<FormData> {
  return new Response(Readable.toWeb(message), {
    headers: { 'content-type': message.headers['content-type'] },
  }).formData()
}

interface ImportLocation {
  line: number
  column: number
}

type ModuleContribution = Map<string, ImportLocation>
type TestFileContribution = Map<string, ModuleContribution>

function mapKeysEqual<K, V>(a: Map<K, V>, b: Map<K, V>): boolean {
  if (a.size !== b.size) {
    return false
  }
  for (const key of a.keys()) {
    if (!b.has(key)) {
      return false
    }
  }
  return true
}

export function rscTestingPlugin(): PluginOption {
  const referencedModules = new Map<string, Set<string>>()
  const contributionsByTestFile = new Map<string, TestFileContribution>()

  const recomputeModule = (moduleId: string) => {
    const union = new Set<string>()

    for (const contrib of contributionsByTestFile.values()) {
      const modMap = contrib.get(moduleId)

      if (modMap) {
        for (const name of modMap.keys()) {
          union.add(name)
        }
      }
    }
    if (union.size > 0) {
      referencedModules.set(moduleId, union)
    } else {
      referencedModules.delete(moduleId)
    }
  }

  const modulesByTaskId = new Map<string, EvaluatedModules>()

  return [
    {
      /**
       * Disable @vitejs/plugin-rsc's HMR cascade that invalidates rsc-side
       * modules whenever the client environment emits a `js-update` for a
       * module that is also a client reference. In a real dev server that
       * cascade is what makes editing a `'use client'` file refresh the
       * server graph; in a test runner there are no mid-test edits, but the
       * same `js-update` event fires incidentally (first-time transforms,
       * optimizeDeps cold starts, dependency re-transforms), and each one
       * tears down the rsc module instance the running test is mutating.
       *
       * We capture `client.hot.send` before plugin-rsc wraps it, then in
       * the `configureServer` post-hook (which runs after every plugin's
       * `configureServer` has executed) we put the original back. This
       * removes plugin-rsc's wrapper from the chain entirely while keeping
       * the rest of plugin-rsc untouched.
       */
      name: 'rsc-testing-plugin:disable-rsc-hot-cascade',
      configureServer(server) {
        const clientHot = server.environments.client.hot
        const originalSend = clientHot.send.bind(clientHot)
        return () => {
          clientHot.send = originalSend
        }
      },
    },
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

        let queue: Promise<void> = Promise.resolve()
        const serialize = <T>(task: () => Promise<T>): Promise<T> => {
          const result = queue.then(task, task)
          queue = result.then(
            () => undefined,
            () => undefined,
          )
          return result
        }

        const mockResolver = createMockResolver(server.hot)

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

          await serialize(() => handleRscRequest(url, req, res))
        })

        const handleRscRequest = async (
          url: URL,
          req: IncomingMessage,
          res: ServerResponse,
        ) => {
          if (!rscEnvironment || !isRunnableDevEnvironment(rscEnvironment)) {
            res.statusCode = 500
            res.end('RSC environment not available')
            return
          }

          const taskId = url.searchParams.get('taskId')

          if (typeof taskId !== 'string') {
            this.error(
              `Failed to process request: expected a taskId string but got ${taskId}`,
            )
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
            modulesByTaskId.delete(taskId)

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

          /**
           * @note Provision unique evaluated modules instances for each test case.
           * Imported modules' cache is scoped to individual test cases (tasks) and gets
           * reset whenever those test cases clear cache in the "afterEach" hook.
           */
          if (typeof taskId === 'string') {
            if (!modulesByTaskId.has(taskId)) {
              modulesByTaskId.set(taskId, new EvaluatedModules())
            }
            rscEnvironment.runner.evaluatedModules =
              modulesByTaskId.get(taskId)!
          }

          /**
           * @note Pre-seed mocked modules from the browser's vi.mock() registry.
           * The manifest is sent as a header on the first render request.
           * Subsequent requests (actions) reuse the same evaluatedModules,
           * so the mocks persist for the entire test case.
           */
          const mockedModulesHeader = req.headers['x-rsc-mocked-modules']
          if (typeof mockedModulesHeader === 'string') {
            const mockedModuleIds = JSON.parse(
              mockedModulesHeader,
            ) as Array<string>

            const evaluatedModules = modulesByTaskId.get(taskId)
            if (mockedModuleIds.length > 0 && evaluatedModules) {
              await preseedMockedModules(
                mockResolver,
                evaluatedModules,
                mockedModuleIds,
              )
            }
          }

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
        }
      },
    },
    {
      name: 'rsc-testing-plugin:collect-test-file-imports',
      enforce: 'pre',
      applyToEnvironment(environment) {
        return environment.name === 'client'
      },
      async transform(code, id) {
        if (!/\.test\.[cm]?[jt]sx?(\?.*)?$/.test(id)) return
        if (id.includes('/node_modules/')) return

        const ast = parse(code, {
          sourceType: 'module',
          plugins: ['typescript', 'jsx'],
          errorRecovery: true,
        })

        interface BindingEntry {
          local: string
          imported: string
          loc: ImportLocation
        }
        const bindingsBySource = new Map<string, BindingEntry[]>()

        const addBinding = (
          source: string,
          imported: string,
          local: string,
          loc: ImportLocation,
        ) => {
          let list = bindingsBySource.get(source)
          if (!list) {
            list = []
            bindingsBySource.set(source, list)
          }
          list.push({ local, imported, loc })
        }

        const locOf = (node: t.Node | null | undefined): ImportLocation => {
          if (!node?.loc) {
            return { line: 1, column: 0 }
          }
          return { line: node.loc.start.line, column: node.loc.start.column }
        }

        for (const node of ast.program.body) {
          if (node.type !== 'ImportDeclaration') {
            continue
          }
          for (const spec of node.specifiers) {
            if (spec.type === 'ImportDefaultSpecifier') {
              addBinding(
                node.source.value,
                'default',
                spec.local.name,
                locOf(spec.local),
              )
            } else if (spec.type === 'ImportSpecifier') {
              const imported =
                spec.imported.type === 'Identifier'
                  ? spec.imported.name
                  : spec.imported.value
              addBinding(
                node.source.value,
                imported,
                spec.local.name,
                locOf(spec.imported),
              )
            }
          }
        }

        const jsxLocals = new Set<string>()

        const walk = (node: unknown, parents: t.Node[]): void => {
          if (node === null || typeof node !== 'object') {
            return
          }
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
            if (root) jsxLocals.add(root.name)
          }

          if (
            n.type === 'CallExpression' &&
            (n as unknown as t.CallExpression).callee.type === 'Import'
          ) {
            const call = n as unknown as t.CallExpression
            const arg = call.arguments[0]
            const declarator = parents.findLast(
              (p): p is t.VariableDeclarator => p.type === 'VariableDeclarator',
            )
            if (
              arg?.type === 'StringLiteral' &&
              declarator &&
              declarator.id.type === 'ObjectPattern'
            ) {
              for (const prop of declarator.id.properties) {
                if (prop.type !== 'ObjectProperty') {
                  continue
                }
                if (prop.key.type !== 'Identifier') {
                  continue
                }
                if (prop.value.type !== 'Identifier') {
                  continue
                }
                addBinding(
                  arg.value,
                  prop.key.name,
                  prop.value.name,
                  locOf(prop.key),
                )
              }
            }
          }

          const nextParents = [...parents, n]
          for (const key of Object.keys(n)) {
            if (key === 'loc' || key === 'start' || key === 'end') {
              continue
            }
            walk(n[key], nextParents)
          }
        }
        walk(ast.program, [])

        const nextContribution: TestFileContribution = new Map()
        for (const [source, bindings] of bindingsBySource) {
          const hasComponent = bindings.some((b) => jsxLocals.has(b.local))
          if (!hasComponent) {
            continue
          }

          const resolved = await this.resolve(source, id)
          if (!resolved) {
            continue
          }

          let modMap = nextContribution.get(resolved.id)
          if (!modMap) {
            modMap = new Map()
            nextContribution.set(resolved.id, modMap)
          }
          for (const b of bindings) {
            modMap.set(b.imported, b.loc)
          }
        }

        const prevContribution: TestFileContribution =
          contributionsByTestFile.get(id) ?? new Map()

        const changedModules = new Set<string>()
        for (const [mid, next] of nextContribution) {
          const prev = prevContribution.get(mid)
          if (!prev || !mapKeysEqual(prev, next)) {
            changedModules.add(mid)
          }
        }
        for (const mid of prevContribution.keys()) {
          if (!nextContribution.has(mid)) {
            changedModules.add(mid)
          }
        }

        contributionsByTestFile.set(id, nextContribution)

        for (const mid of changedModules) {
          recomputeModule(mid)
          const mod = this.environment.moduleGraph.getModuleById(mid)
          if (mod) {
            this.environment.moduleGraph.invalidateModule(mod)
          }
        }

        if (changedModules.size > 0 && prevContribution.size > 0) {
          this.environment.hot.send({ type: 'full-reload' })
        }
      },
    },
    {
      name: 'rsc-testing-plugin:stub-imported-module',
      enforce: 'pre',
      applyToEnvironment(environment) {
        return environment.name === 'client'
      },
      transform(code, id) {
        const requested = referencedModules.get(id)
        if (!requested || requested.size === 0) {
          return
        }

        const ast = parse(code, {
          sourceType: 'module',
          plugins: ['typescript', 'jsx'],
          errorRecovery: true,
        })

        const exports = collectModuleExports(ast)
        const lines: Array<string> = []

        const emitUndefined = (name: string) => {
          if (name === 'default') {
            lines.push(`export default undefined;`)
          } else {
            lines.push(`const ${name} = undefined;`)
            lines.push(`export { ${name} };`)
          }
        }

        for (const name of requested) {
          const info = exports.get(name)
          if (!info) {
            this.warn(`"${name}" is not exported from ${id}; removed.`)
            emitUndefined(name)
            continue
          }

          if (info.kind === 'unknown') {
            const message = `Failed to import "${name}" from "${id}": only React components and static values can be imported in the browser. Please remove "${name}" or move it to a separate module if you wish to use it in your browser tests.`
            let reported = false
            for (const [testFile, contrib] of contributionsByTestFile) {
              const modMap = contrib.get(id)
              if (!modMap) {
                continue
              }
              const loc = modMap.get(name)
              if (!loc) {
                continue
              }
              this.warn({
                message,
                loc: {
                  file: testFile,
                  line: loc.line,
                  column: loc.column,
                },
              })
              reported = true
            }
            if (!reported) {
              this.warn(message)
            }
            emitUndefined(name)
            continue
          }

          if (info.kind === 'component') {
            const varName = name === 'default' ? '__default__' : name
            lines.push(`const ${varName} = () => null;`)
            lines.push(
              `${varName}.__componentPath = ${JSON.stringify(`${id}#${name}`)};`,
            )
            if (name === 'default') {
              lines.push(`export default ${varName};`)
            } else {
              lines.push(`export { ${varName} as ${name} };`)
            }
            continue
          }

          const valueSrc = code.slice(info.valueStart, info.valueEnd)
          if (name === 'default') {
            lines.push(`export default ${valueSrc};`)
          } else {
            lines.push(`export const ${name} = ${valueSrc};`)
          }
        }

        return { code: lines.join('\n'), map: null }
      },
    },
  ]
}
