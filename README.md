# `vite-plugin-rsc-testing`

Vite plugin for testing React Server Components in Vitest Browser Mode.

## Features

- [x] Async server components (`Suspense`);
- [ ] Interactive server components;
- [ ] Server actions;

## Getting started

### Install

```ts
npm i vite-plugin-rsc-testing @vitejs/plugin-rsc vitest-browser-react
```

### Configure

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import rscTesting from 'vite-plugin-rsc-testing'

export default defineConfig({
  plugins: [rscTesting()],
  test: { ... }
})
```

> This plugin works in combination with the Browser Mode in Vitest so make sure to have that enabled.

### Write tests

```tsx
// src/homepage.tsx
export default async function Homepage() {
  const pokemon = await fetch('https://pokeapi.co/api/v2/pokemon/1')

  return <h1>{pokemon.name}</h1>
}
```

```ts
// src/homepage.test.tsx
import { page } from 'vitest/browser'
import { renderAsync } from 'vite-plugin-rsc-testing'
import Homepage from './homepage'

it('displays the pokemon details', async () => {
  await renderAsync(<Homepage />)

  await page.element(
    page.getByRole('heading', { name: 'Charizard' })
  ).toBeVisible()
})
```

## How does this work?

1. The test calls `renderAsync` in the browser and creates a component stream via `createFromFetch`, sending the component's path to the middleware endpoint created by the plugin.
2. The middleware endpoint runs `@vitejs/plugin-rsc/rsc` to render the component at the given path into a stream server-side (`renderToReadableStream`) and stream the in-flight response back to the test.
3. The test passes the component stream to the `render` function from `vitest-browser-react` to render the component client-side.

The goal of this plugin is to adhere to the RSC rendering model in production applications. After all, a component test already has all the pieces needed to implement that model:

- The client (your test that runs in the browser);
- The server (the internal middleware endpoint on the Vite dev server during the test run).

This creates a realistic render flow where your server components _run on the actual server_ (the Node.js thread of your test runner) and stream the response to the client where the component tree is hydrated and becomes interactive.
