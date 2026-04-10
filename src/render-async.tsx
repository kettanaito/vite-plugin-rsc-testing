import {
  use,
  Suspense,
  type ReactElement,
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

export async function renderAsync(
  element: ReactElement,
): Promise<RenderResult> {
  const componentPath = (element.type as { __rscPath?: string }).__rscPath

  if (!componentPath) {
    throw new Error(
      'Component does not have an __rscPath. Is the rscTransformPlugin active?',
    )
  }

  const componentUrl = `/__rsc?component=${encodeURIComponent(componentPath)}`
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
  let setPayload: (value: RscPayload) => void

  const initialPayload = use(payloadStream)
  const [payload, _setPayload] = useState<RscPayload>(initialPayload)

  useEffect(() => {
    setPayload = (value) => startTransition(() => _setPayload(value))
  }, [_setPayload])

  setServerCallback(async (id, args) => {
    const temporaryReferences = createTemporaryReferenceSet()
    const payload = await createFromFetch<RscPayload>(
      fetch(componentUrl, {
        method: 'POST',
        headers: {
          'x-rsc-action': id,
        },
        body: await encodeReply(args, { temporaryReferences }),
      }),
    )

    setPayload(payload)
    const { ok, data } = payload.returnValue || {}

    if (!ok) {
      throw data
    }

    return data
  })

  return payload.root
}
