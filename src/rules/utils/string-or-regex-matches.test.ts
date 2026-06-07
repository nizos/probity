import { describe, it, expect } from 'vitest'

import { stringOrRegexMatches } from './string-or-regex-matches.js'

describe('stringOrRegexMatches', () => {
  it('matches a literal substring', () => {
    expect(stringOrRegexMatches('npm install foo', 'npm install')).toBe(true)
    expect(stringOrRegexMatches('npm run dev', 'npm install')).toBe(false)
  })

  it('matches a regex', () => {
    expect(stringOrRegexMatches('rm -rf /', /rm\s+-rf/)).toBe(true)
    expect(stringOrRegexMatches('git rm file', /rm\s+-rf/)).toBe(false)
  })

  it('matches a sticky regex anywhere in the haystack (fail-open guard)', () => {
    expect(stringOrRegexMatches('  forbidden', /forbidden/y)).toBe(true)
  })

  it('is not stateful across calls with a global regex', () => {
    const re = /x/g
    expect(stringOrRegexMatches('axb', re)).toBe(true)
    expect(stringOrRegexMatches('axb', re)).toBe(true)
  })
})
