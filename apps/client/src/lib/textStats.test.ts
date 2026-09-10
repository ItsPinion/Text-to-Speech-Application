import { describe, expect, it } from 'vitest'

import { countWords } from './textStats'

describe('countWords', () => {
  it('counts "Hello world" as 2 words (plan 4.2)', () => {
    expect(countWords('Hello world')).toBe(2)
  })

  it('"Hello world" is 11 characters (plan 4.2)', () => {
    expect('Hello world'.length).toBe(11)
  })

  it('returns 0 for whitespace-only text', () => {
    expect(countWords('   \n\t ')).toBe(0)
  })

  it('collapses repeated whitespace', () => {
    expect(countWords('one  two\n\nthree\tfour')).toBe(4)
  })
})
