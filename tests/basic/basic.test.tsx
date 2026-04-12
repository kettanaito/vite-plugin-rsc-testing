import { it, expect } from 'vitest'
import { page } from 'vitest/browser'
import { renderAsync } from '../../src/render-async'
import Component from './server'

it('renders a react server component', async () => {
  await renderAsync(<Component />)

  await expect
    .element(page.getByRole('heading'))
    .toHaveTextContent('Hello world')
})
