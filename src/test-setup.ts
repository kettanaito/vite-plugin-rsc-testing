import { beforeEach, afterEach } from 'vitest'

declare global {
  var __VITEST_TASK_ID__: string
}

beforeEach(({ task }) => {
  globalThis.__VITEST_TASK_ID__ = task.id
})

afterEach(({ task }) => {
  return fetch(`/__rsc?clearCache=1&taskId=${task.id}`)
})
