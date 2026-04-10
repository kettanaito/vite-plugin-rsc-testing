import { it, expect } from 'vitest'
import { page } from 'vitest/browser'
import { renderAsync } from '../../src/render-async'
import AsyncComponent from './server'

it('renders an async react server component', async () => {
  await renderAsync(<AsyncComponent />)

  await expect
    .element(page.getByText('Fetching...'), {
      message: 'Renders the suspense fallback',
    })
    .toBeVisible()
  await expect
    .element(page.getByRole('list').getByRole('listitem'), {
      message: 'Renders the fetched data',
    })
    .toHaveLength(3)
})
