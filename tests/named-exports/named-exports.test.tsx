import { page } from 'vitest/browser'
import { renderAsync } from '../../src/render-async'
import { ServerComponentOne, ServerComponentTwo } from './server'

it('supports named server components', async () => {
  await renderAsync(<ServerComponentOne />)
  await expect.element(page.getByRole('alert')).toHaveTextContent('Hello world')
})

it('supports named server components with props', async () => {
  await renderAsync(<ServerComponentTwo username="kettanaito" />)
  await expect
    .element(page.getByRole('alert'))
    .toHaveTextContent('Hello, kettanaito')
})

it('supports dynamically imported named server components', async () => {
  const { ServerComponentOne } = await import('./server')

  await renderAsync(<ServerComponentOne />)
  await expect.element(page.getByRole('alert')).toHaveTextContent('Hello world')
})
