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
      `Failed to render a server component: expected a component path but got "${componentPath}"`,
    )
  }

  const searchParams = new URLSearchParams({
    c: componentPath,
  })

  if (element.props != null) {
    searchParams.set('p', JSON.stringify(element.props))
  }

  const componentUrl = `/__rsc?${searchParams.toString()}`
  const payloadStream = createFromFetch<RscPayload>(fetch(componentUrl))

  return render(
    <Suspense>
      <RscRoot componentUrl={componentUrl} payloadStream={payloadStream} />,
    </Suspense>,
  )
}

function RscRoot({
  componentUrl,
  payloadStream,
}: {
  componentUrl: string
  payloadStream: PromiseLike<RscPayload>
}) {
  const initialPayload = use(payloadStream)
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
      if (next.returnValue && !next.returnValue.ok) throw next.returnValue.data
      return next.returnValue?.data
    })
  }, [componentUrl])

  return payload.root
}
