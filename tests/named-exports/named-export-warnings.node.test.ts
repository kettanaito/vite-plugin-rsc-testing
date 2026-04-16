import { Writable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { createVitest } from 'vitest/node'
import { rscTestingPlugin } from '../../src'

async function createDisposableVitest() {
  const chunks: Array<string> = []
  const sink = new Writable({
    write(chunk, _, callback) {
      chunks.push(String(chunk))
      callback()
    },
  })

  const vitest = await createVitest(
    'test',
    {
      run: true,
      watch: false,
    },
    {
      plugins: [rscTestingPlugin()],
    },
    {
      stdout: sink,
      stderr: sink,
    },
  )

  return {
    [Symbol.asyncDispose]: vitest.close.bind(vitest),
    vitest,
    chunks,
  }
}

it('does not print a warning on importing types', async () => {
  const testFilePath = fileURLToPath(
    new URL('./named-export-type.test.tsx', import.meta.url),
  )

  await using disposableVitest = await createDisposableVitest()
  const runResult = await disposableVitest.vitest.start([testFilePath])

  const stdout = disposableVitest.chunks.join('')
  expect(stdout).not.toContain('warning:')
  expect(runResult.unhandledErrors).toEqual([])
})

it('does not warn on importing static values', async () => {
  const testFilePath = fileURLToPath(
    new URL('./named-export-static-values.test.tsx', import.meta.url),
  )

  await using disposableVitest = await createDisposableVitest()
  const runResult = await disposableVitest.vitest.start([testFilePath])

  const stdout = disposableVitest.chunks.join('')
  expect(stdout).not.toContain('Failed to import')
  expect(runResult.unhandledErrors).toEqual([])
})

it('prints a warning importing an ambiguous function', async () => {
  const testFilePath = fileURLToPath(
    new URL('./named-export-function.test.tsx', import.meta.url),
  )
  const importedFilePath = fileURLToPath(
    new URL('./server.tsx', import.meta.url),
  )

  await using disposableVitest = await createDisposableVitest()
  const runResult = await disposableVitest.vitest.start([testFilePath])

  const stdout = disposableVitest.chunks.join('')
  expect(stdout, 'Prints a meaningful warning').toContain(
    `warning: Failed to import "ambiguousFunction" from "${importedFilePath}": only React components and static values can be imported in the browser. Please remove "ambiguousFunction" or move it to a separate module if you wish to use it in your browser tests.`,
  )
  expect(stdout, 'Points to the problematic import').toContain(
    `import { ServerComponentOne, ambiguousFunction } from './server'`,
  )
  expect(runResult.unhandledErrors).toEqual([])
})

it('prints a warning importing an ambiguous class', async () => {
  const testFilePath = fileURLToPath(
    new URL('./named-export-class.test.tsx', import.meta.url),
  )
  const importedFilePath = fileURLToPath(
    new URL('./server.tsx', import.meta.url),
  )

  await using disposableVitest = await createDisposableVitest()
  const runResult = await disposableVitest.vitest.start([testFilePath])

  const stdout = disposableVitest.chunks.join('')
  expect(stdout, 'Prints a meaningful warning').toContain(
    `warning: Failed to import "AmbiguousClass" from "${importedFilePath}": only React components and static values can be imported in the browser. Please remove "AmbiguousClass" or move it to a separate module if you wish to use it in your browser tests.`,
  )
  expect(stdout, 'Points to the problematic import').toContain(
    `import { ServerComponentOne, AmbiguousClass } from './server'`,
  )
  expect(runResult.unhandledErrors).toEqual([])
})
