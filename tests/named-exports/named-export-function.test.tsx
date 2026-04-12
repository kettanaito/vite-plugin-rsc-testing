import { page } from 'vitest/browser'
import { renderAsync } from '../../src/render-async'
import { ServerComponentOne, ambiguousFunction } from './server'

it('sets the value of an ambiguous function to undefined', async () => {
  expect(ambiguousFunction).toBeUndefined()

  /**
   * @note Rendering a component is what marks the module as server-side.
   */
  await renderAsync(<ServerComponentOne />)
  await expect
    .element(page.getByRole('heading'))
    .toHaveTextContent('Hello world')
})
