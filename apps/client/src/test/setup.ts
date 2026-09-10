import { cleanup } from '@testing-library/react'
import { afterEach, beforeAll } from 'vitest'

import '@testing-library/jest-dom/vitest'

afterEach(() => {
  cleanup()
})

beforeAll(() => {
  // jsdom cannot play media; silence its "not implemented" noise.
  window.HTMLMediaElement.prototype.load = () => {}
  window.HTMLMediaElement.prototype.play = () => Promise.resolve()
  window.HTMLMediaElement.prototype.pause = () => {}
})

export {}
