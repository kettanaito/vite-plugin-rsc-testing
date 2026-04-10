import { Suspense } from 'react'
import { randomUUID } from 'node:crypto'

export default async function AsyncComponent() {
  return (
    <Suspense fallback={<p>Fetching...</p>}>
      <h1>Pokemons {randomUUID()}</h1>
      <PokemonList />
    </Suspense>
  )
}

function createRandomId() {
  return Math.floor(Math.random() * 151) + 1
}

async function PokemonList() {
  const pokemons = await Promise.all(
    new Array(3).fill(null).map(async () => {
      const response = await fetch(
        `https://pokeapi.co/api/v2/pokemon/${createRandomId()}`,
      )
      await new Promise((r) => setTimeout(r, 1500))
      return response.json()
    }),
  )

  return (
    <ul className="flex gap-4">
      {pokemons.map((pokemon) => (
        <li key={pokemon.name}>
          <link
            rel="preload"
            as="image"
            type="image/png"
            href={pokemon.sprites.front_default}
          />
          <article className="p-4 border rounded-md">
            <img src={pokemon.sprites.front_default} className="size-24" />
            <h3 className="text-center">{pokemon.name}</h3>
          </article>
        </li>
      ))}
    </ul>
  )
}
