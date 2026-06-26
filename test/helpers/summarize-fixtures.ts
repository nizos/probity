// Fixtures for the refactor-enforcement deny test. summarize() ends up with
// the same nested counting loop pasted verbatim into three mode branches: a
// clumsy, self-contained duplication with no per-mode reason to diverge, so
// lifting it into a named helper is unmistakably the right move. SUMMARIZE_TESTS
// is the test file at green; SUMMARIZE_TESTS_WITH_PERCENT adds a test for a new
// mode, crossing the green->red boundary while the duplication is unrefactored.

export const SUMMARIZE_TESTS = `import { describe, expect, it } from 'vitest'

import { summarize } from './summarize.js'

const items = [
  { name: 'a', tags: ['priority'], score: 80 },
  { name: 'b', tags: ['p:high'], score: 60 },
  { name: 'c', tags: ['other'], score: 95 },
]

describe('summarize', () => {
  it('count mode reports the qualified count', () => {
    expect(summarize(items, 'count')).toBe('1 qualified')
  })

  it('ratio mode reports qualified over total', () => {
    expect(summarize(items, 'ratio')).toBe('1/3')
  })

  it('status mode reports overall status', () => {
    expect(summarize(items, 'status')).toBe('some pending')
  })
})
`

export const SUMMARIZE_TESTS_WITH_PERCENT = `import { describe, expect, it } from 'vitest'

import { summarize } from './summarize.js'

const items = [
  { name: 'a', tags: ['priority'], score: 80 },
  { name: 'b', tags: ['p:high'], score: 60 },
  { name: 'c', tags: ['other'], score: 95 },
]

describe('summarize', () => {
  it('count mode reports the qualified count', () => {
    expect(summarize(items, 'count')).toBe('1 qualified')
  })

  it('ratio mode reports qualified over total', () => {
    expect(summarize(items, 'ratio')).toBe('1/3')
  })

  it('status mode reports overall status', () => {
    expect(summarize(items, 'status')).toBe('some pending')
  })

  it('percent mode reports the qualified percentage', () => {
    expect(summarize(items, 'percent')).toBe('33%')
  })
})
`
