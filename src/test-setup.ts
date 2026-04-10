import { beforeEach } from 'vitest'

beforeEach(() => {
  return fetch('/__rsc?clearCache=1')
})
