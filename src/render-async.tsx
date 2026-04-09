import { use, Suspense, type ReactNode, type ReactElement } from 'react'
import { render, type RenderResult } from 'vitest-browser-react'
import { createFromFetch } from '@vitejs/plugin-rsc/browser'

export async function renderAsync(
  element: ReactElement,
): Promise<RenderResult> {
  const componentPath = (element.type as { __rscPath?: string }).__rscPath

  if (!componentPath) {
    throw new Error(
      'Component does not have an __rscPath. Is the rscTransformPlugin active?',
    )
  }

  const componentStream = createFromFetch(
    fetch(`/__rsc?component=${encodeURIComponent(componentPath)}`),
  ) as PromiseLike<ReactNode>

  return render(<RscRoot stream={componentStream} />)
}

function RscRoot({ stream }: { stream: PromiseLike<ReactNode> }) {
  return <Suspense>{use(stream)}</Suspense>
}
