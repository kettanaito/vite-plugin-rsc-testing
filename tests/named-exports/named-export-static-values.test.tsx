import { page } from 'vitest/browser'
import { renderAsync } from '../../src/render-async'
import { ServerComponentTwo, CONSTANT } from './server'

it('supports importing static constants', async () => {
  expect(CONSTANT).toBe(42)

  await renderAsync(<ServerComponentTwo username={CONSTANT.toString()} />)
  await expect
    .element(page.getByRole('heading'))
    .toHaveTextContent(`Hello, ${CONSTANT}`)
})
