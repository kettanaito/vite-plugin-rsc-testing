import fs from 'node:fs'

export interface Post {
  id: number
  title: string
}

export async function PostsList() {
  const posts = await fs.promises
    .readFile('./posts.json', 'utf8')
    .then((contents) => JSON.parse(contents) as Array<Post>)

  return (
    <ul>
      {posts.map((post) => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  )
}
