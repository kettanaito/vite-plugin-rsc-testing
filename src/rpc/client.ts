import { RpcSession, RpcTarget, type RpcTransport } from 'capnweb'

/**
 * Browser-side mock resolver exposed to the server via cap'n web RPC.
 * The server calls `resolveImport(id)` on this target, which triggers
 * `vi.importMock()` in the browser (honoring vi.mock factories).
 */
class MockResolver extends RpcTarget {
  async resolveImport(id: string): Promise<Record<string, unknown>> {
    console.log('[rsc:mock] resolving', id)
    const resolved = await vi.importMock(id).catch(() => ({}))
    console.log('[rsc:mock] resolved', id, Object.keys(resolved))
    return resolved
  }
}

/**
 * Create an RPC transport over Vite's HMR channel.
 * Messages are exchanged via `import.meta.hot.send()` / `.on()`.
 */
function createHmrTransport(): RpcTransport {
  const pending: Array<(message: string) => void> = []
  const buffered: Array<string> = []

  import.meta.hot!.on('rsc-rpc', (data: { message: string }) => {
    const waiter = pending.shift()
    if (waiter) {
      waiter(data.message)
    } else {
      buffered.push(data.message)
    }
  })

  return {
    async send(message: string) {
      import.meta.hot!.send('rsc-rpc', { message })
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
}

if (import.meta.hot) {
  new RpcSession(createHmrTransport(), new MockResolver())
}
