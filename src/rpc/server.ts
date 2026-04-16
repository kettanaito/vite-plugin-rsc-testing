import { RpcSession, type RpcTransport } from 'capnweb'
import type { HotChannel } from 'vite'
import type { EvaluatedModules } from 'vite/module-runner'

export interface MockResolver {
  resolveImport(id: string): Promise<Record<string, unknown>>
}

/**
 * Create a cap'n web RPC session over Vite's HMR channel.
 * Returns the remote mock resolver proxy exposed by the browser.
 */
export function createMockResolver(hot: HotChannel): MockResolver {
  const pending: Array<(message: string) => void> = []
  const buffered: Array<string> = []

  hot.on('rsc-rpc', (data: { message: string }) => {
    const waiter = pending.shift()
    if (waiter) {
      waiter(data.message)
    } else {
      buffered.push(data.message)
    }
  })

  const transport: RpcTransport = {
    async send(message: string) {
      hot.send('rsc-rpc', { message })
    },
    receive() {
      const queued = buffered.shift()
      if (queued) {
        return Promise.resolve(queued)
      }
      return new Promise((resolve) => {
        pending.push(resolve)
      })
    },
  }

  const session = new RpcSession<MockResolver>(transport)
  return session.getRemoteMain()
}

/**
 * Pre-seed the per-taskId evaluatedModules with mocked modules
 * resolved from the browser via RPC. Each mocked module gets an entry
 * with `evaluated: true` and a resolved promise, so the runner
 * returns it directly without fetching/externalizing.
 */
export async function preseedMockedModules(
  mockResolver: MockResolver,
  evaluatedModules: EvaluatedModules,
  mockedModuleIds: Array<string>,
): Promise<void> {
  await Promise.all(
    mockedModuleIds.map(async (moduleId) => {
      console.log('[rsc:mock] requesting mock from browser:', moduleId)
      const exports = await mockResolver.resolveImport(moduleId)
      console.log('[rsc:mock] pre-seeding:', moduleId, exports)

      const node = evaluatedModules.ensureModule(moduleId, moduleId)
      node.meta = { id: moduleId, url: moduleId, code: '' }
      node.evaluated = true

      const moduleExports = { ...exports, default: exports }
      node.promise = Promise.resolve(moduleExports)
    }),
  )
}
