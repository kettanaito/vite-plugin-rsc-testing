import { it, expect } from 'vitest'
import { page } from 'vitest/browser'
import { renderAsync } from '../src/render-async'
import Homepage from './suspense'

it('renders the list of pokemon', async () => {
  await renderAsync(<Homepage />)
  await expect
    .element(page.getByRole('list').getByRole('listitem'))
    .toHaveLength(3)
})
