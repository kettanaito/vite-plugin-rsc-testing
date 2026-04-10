import { it, expect } from 'vitest'
import { page } from 'vitest/browser'
import { renderAsync } from '../../src/render-async'
import Server from './server'

it('dispatches a server action from the client component', async () => {
  await renderAsync(<Server />)

  await page.getByRole('button', { name: 'Create note' }).click()

  await expect.element(page.getByRole('list')).toHaveTextContent('New Note')
  await expect
    .element(page.getByRole('list').getByRole('listitem'))
    .toHaveLength(1)
})
