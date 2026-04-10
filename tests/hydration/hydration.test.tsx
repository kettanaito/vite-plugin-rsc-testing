import { it, expect } from 'vitest'
import { page } from 'vitest/browser'
import { renderAsync } from '../../src/render-async'
import Notes from './server'

it('renders an interactive hydrated component', async () => {
  await renderAsync(<Notes />)
  await expect
    .element(page.getByRole('heading', { name: 'First note' }))
    .toBeVisible()

  await page.getByRole('button', { name: 'Toggle' }).click()
  await expect.element(page.getByText('Hello world')).toBeVisible()
})
