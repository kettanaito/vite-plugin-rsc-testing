import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { page } from 'vitest/browser'
import { renderAsync } from '../../src/render-async'
import {
  ServerComponentOne,
  ServerComponentTwo,
} from './server' with { type: 'react-server' }

beforeAll(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.clearAllMocks()
})

afterAll(() => {
  vi.restoreAllMocks()
})

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

  expect(console.warn).not.toHaveBeenCalled()
  await renderAsync(<ServerComponentOne />)
  await expect.element(page.getByRole('alert')).toHaveTextContent('Hello world')
})

it('does not warn on importing static constants', async () => {
  const { CONSTANT, ServerComponentTwo } = await import('./server')

  expect(console.warn).not.toHaveBeenCalled()
  expect(CONSTANT).toBe(42)

  await renderAsync(<ServerComponentTwo username={CONSTANT.toString()} />)
  await expect
    .element(page.getByRole('alert'))
    .toHaveTextContent(`Hello, ${CONSTANT}`)
})

it.only('warns on importing functions', async () => {
  const { helper } = await import('./server')

  expect(console.warn).toHaveBeenCalledExactlyOnceWith('TODO')
  expect(helper).toBeUndefined()
})
