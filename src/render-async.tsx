import {
  type ReactElement,
  use,
  Suspense,
  useState,
  useEffect,
  startTransition,
} from 'react'
import { render, type RenderResult } from 'vitest-browser-react'
import {
  setRequireModule,
  createFromFetch,
  createTemporaryReferenceSet,
  encodeReply,
  setServerCallback,
} from '@vitejs/plugin-rsc/browser'
import './rpc/client'
import type { RscPayload } from '.'

setRequireModule({
  load: (id) => {
    return import(/* @vite-ignore */ id)
  },
})

type ReactServerElement = ReactElement & {
  type: {
    __componentPath?: string
  }
}

export async function renderAsync(
  element: ReactServerElement,
): Promise<RenderResult> {
  const componentPath = element.type.__componentPath

  if (typeof componentPath !== 'string') {
    throw new Error(
      `Failed to render a server component "${element.type.name}": expected a component path but got "${componentPath}"`,
    )
  }

  const searchParams = new URLSearchParams({
    c: componentPath,
    taskId: globalThis.__VITEST_TASK_ID__,
  })

  if (element.props != null) {
    searchParams.set('p', JSON.stringify(element.props))
  }

  const mockedModuleIds = extractMockedModuleIds()
  console.log('[rsc:mock] mocked module ids:', [...mockedModuleIds])

  const headers: Record<string, string> = {}
  if (mockedModuleIds.size > 0) {
    headers['x-rsc-mocked-modules'] = JSON.stringify([...mockedModuleIds])
  }

  const componentUrl = `/__rsc?${searchParams.toString()}`
  const payloadPromise = createFromFetch<RscPayload>(
    fetch(componentUrl, { headers }),
  )

  return render(
    <Suspense>
      <RscRoot componentUrl={componentUrl} payloadPromise={payloadPromise} />,
    </Suspense>,
  )
}

function RscRoot({
  componentUrl,
  payloadPromise,
}: {
  componentUrl: string
  payloadPromise: PromiseLike<RscPayload>
}) {
  const initialPayload = use(payloadPromise)
  const [payload, setPayload] = useState<RscPayload>(initialPayload)

  useEffect(() => {
    setServerCallback(async (id, args) => {
      const temporaryReferences = createTemporaryReferenceSet()
      const next = await createFromFetch<RscPayload>(
        fetch(componentUrl, {
          method: 'POST',
          headers: { 'x-rsc-action': id },
          body: await encodeReply(args, { temporaryReferences }),
        }),
      )

      startTransition(() => setPayload(next))

      if (next.returnValue && !next.returnValue.ok) {
        throw next.returnValue.data
      }

      return next.returnValue?.data
    })
  }, [componentUrl])

  return payload.root
}

function extractMockedModuleIds(): Set<string> {
  const ids = new Set<string>()
  const registry = globalThis.__vitest_mocker__.registry
  for (const [, entry] of registry.registryById) {
    ids.add(entry.raw)
  }
  return ids
}
