export default async function Greeting({ username }: { username: string }) {
  return <p role="alert">Hello, {username}</p>
}
