export async function ServerComponentOne() {
  return <p role="alert">Hello world</p>
}

export async function ServerComponentTwo({ username }: { username: string }) {
  return <p role="alert">Hello, {username}</p>
}

export const CONSTANT = 42

export function ambiguousFunction() {
  throw new Error('Must never run client-side')
}

export class AmbiguousClass {
  public action() {}
}
