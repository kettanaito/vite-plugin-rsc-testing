import { page } from 'vitest/browser'
import { renderAsync } from '../../src/render-async'
import { ServerComponentTwo, type Props } from './server'

it('imports a type', async () => {
  const props = {
    username: 'kettanaito',
  } satisfies Props

  /**
   * @note Rendering a component is what marks the module as server-side.
   */
  await renderAsync(<ServerComponentTwo {...props} />)
  await expect
    .element(page.getByRole('heading'))
    .toHaveTextContent('Hello, kettanaito')
})
