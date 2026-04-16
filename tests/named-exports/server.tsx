export type Props = { username: string }

export async function ServerComponentOne() {
  return <h1>Hello world</h1>
}

export async function ServerComponentTwo({ username }: Props) {
  return <h1>Hello, {username}</h1>
}

export const CONSTANT = 42

export function ambiguousFunction() {
  throw new Error('Must never run client-side')
}

export class AmbiguousClass {
  public action() {}
}
