type MockerStub = { wrapDynamicImport: <T>(factory: () => T) => T }

declare global {
  var __vitest_mocker__: MockerStub
  var __vitest_browser_runner__: MockerStub
}

const stub: MockerStub = {
  wrapDynamicImport: (factory) => factory(),
}

globalThis.__vitest_mocker__ ??= stub
globalThis.__vitest_browser_runner__ ??= stub

export {}
