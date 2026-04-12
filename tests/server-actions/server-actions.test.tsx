import { it, expect } from 'vitest'
import { page } from 'vitest/browser'
import { renderAsync } from '../../src/render-async'
import ActionFromClient from './action-from-client/server'
import ActionFormSubmission from './action-form-submission/server'

it('dispatches a server action from the client component', async () => {
  await renderAsync(<ActionFromClient />)

  await page.getByRole('button', { name: 'Create note' }).click()

  const notes = page.getByRole('list').getByRole('listitem')
  await expect.element(notes).toHaveLength(1)
  await expect.element(notes).toHaveTextContent('New Note')
})

it('calls a server action on client-side form submission', async () => {
  await renderAsync(<ActionFormSubmission />)

  await page.getByLabelText('Title').fill('First Note')
  await page.getByRole('button', { name: 'Create Note' }).click()

  const notes = page.getByRole('list').getByRole('listitem')
  await expect.element(notes).toHaveLength(1)
  await expect.element(notes).toHaveTextContent('First Note')
})

it('persists server-side module state between server actions', async () => {
  await renderAsync(<ActionFormSubmission />)

  {
    await page.getByLabelText('Title').fill('First Note')
    await page.getByRole('button', { name: 'Create Note' }).click()

    const notes = page.getByRole('list').getByRole('listitem')
    await expect.element(notes).toHaveLength(1)
    await expect.element(notes).toHaveTextContent('First Note')
  }

  {
    await page.getByLabelText('Title').fill('Second Note')
    await page.getByRole('button', { name: 'Create Note' }).click()

    const notes = page.getByRole('list').getByRole('listitem')
    await expect.element(notes).toHaveLength(2)
    await expect.element(notes.nth(0)).toHaveTextContent('First Note')
    await expect.element(notes.nth(1)).toHaveTextContent('Second Note')
  }
})
