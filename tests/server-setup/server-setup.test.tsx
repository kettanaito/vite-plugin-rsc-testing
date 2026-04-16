import { page } from 'vitest/browser'
import { renderAsync } from '../../src/render-async'
import { PostsList, type Post } from './server'

vi.mock('node:fs', () => {
  return {
    promises: {
      readFile: vi.fn().mockResolvedValue(
        JSON.stringify([
          {
            id: 1,
            title: document.title,
          },
        ] satisfies Array<Post>),
      ),
    },
  }
})

it('mocks a read from the file system', async () => {
  await renderAsync(<PostsList />)

  const posts = page.getByRole('list').getByRole('listitem')
  await expect.element(posts).toHaveLength(1)
  await expect.element(posts.nth(0)).toHaveTextContent('Vitest Browser Tester')
})
