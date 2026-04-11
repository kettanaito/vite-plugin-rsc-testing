import { it, expect } from 'vitest'
import { page } from 'vitest/browser'
import { renderAsync } from '../../src/render-async'
import Greeting from './server'

it('passes props to the server component', async () => {
  const { rerender } = await renderAsync(<Greeting username="kettanaito" />)
  await expect
    .element(page.getByRole('alert'))
    .toHaveTextContent('Hello, kettanaito')
})
