import { page } from 'vitest/browser'
import { renderAsync } from '../../src/render-async'
import { ServerComponentOne, AmbiguousClass } from './server'

it('sets the value of an ambiguous function to undefined', async () => {
  expect(AmbiguousClass).toBeUndefined()

  /**
   * @note Rendering a component is what marks the module as server-side.
   */
  await renderAsync(<ServerComponentOne />)
  await expect.element(page.getByRole('alert')).toHaveTextContent('Hello world')
})
