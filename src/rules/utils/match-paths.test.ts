import { describe, it, expect } from 'vitest'

import { buildMatcher, actionMatchesFilesScope } from './match-paths.js'

describe('buildMatcher', () => {
  it('matches a path against an include glob', () => {
    const matches = buildMatcher(['src/**'])
    expect(matches('src/foo.ts')).toBe(true)
    expect(matches('README.md')).toBe(false)
  })

  it('treats a leading ! as a negation (exclude)', () => {
    const matches = buildMatcher(['src/**', '!src/**/*.test.ts'])
    expect(matches('src/foo.ts')).toBe(true)
    expect(matches('src/foo.test.ts')).toBe(false)
  })

  it('defaults to matching everything when only negations are given', () => {
    const matches = buildMatcher(['!node_modules/**'])
    expect(matches('src/foo.ts')).toBe(true)
    expect(matches('node_modules/pkg/index.js')).toBe(false)
  })

  it('rejects all paths when given an empty pattern list', () => {
    const matches = buildMatcher([])
    expect(matches('src/foo.ts')).toBe(false)
    expect(matches('anything')).toBe(false)
  })

  it('matches a drive-letter POSIX path against a `**/src/**` glob', () => {
    const matches = buildMatcher(['**/src/**'])
    expect(matches('C:/src/proj/src/foo.ts')).toBe(true)
    expect(matches('C:/proj/lib/foo.ts')).toBe(false)
  })

  it('matches a drive-letter POSIX path against an anchored `<root>/src/**` glob', () => {
    const matches = buildMatcher(['C:/proj/src/**'])
    expect(matches('C:/proj/src/foo.ts')).toBe(true)
    expect(matches('C:/proj/lib/foo.ts')).toBe(false)
  })

  it('matches dotfiles and dot-directories under a glob (fail-open guard)', () => {
    expect(buildMatcher(['src/**'])('src/.eslintrc.js')).toBe(true)
    expect(buildMatcher(['**/*.md'])('.github/CONTRIBUTING.md')).toBe(true)
  })

  it('applies dot-awareness to negations so a glob can exclude a dotfile', () => {
    // Literal include so only the glob negation's dot-awareness decides.
    expect(buildMatcher(['src/.env', '!src/*'])('src/.env')).toBe(false)
  })
})

describe('actionMatchesFilesScope', () => {
  it('returns false when files is empty, regardless of action kind', () => {
    expect(
      actionMatchesFilesScope([], {
        kind: 'write',
        path: 'src/foo.ts',
        content: '',
      }),
    ).toBe(false)
    expect(
      actionMatchesFilesScope([], { kind: 'command', command: 'git commit' }),
    ).toBe(false)
  })

  it('returns true for command actions regardless of glob (commands bypass path filter)', () => {
    expect(
      actionMatchesFilesScope(['src/**'], {
        kind: 'command',
        command: 'git commit',
      }),
    ).toBe(true)
  })

  it('returns true for a write whose path matches the glob', () => {
    expect(
      actionMatchesFilesScope(['src/**'], {
        kind: 'write',
        path: 'src/foo.ts',
        content: '',
      }),
    ).toBe(true)
  })

  it('returns false for a write whose path does not match the glob', () => {
    expect(
      actionMatchesFilesScope(['src/**'], {
        kind: 'write',
        path: 'README.md',
        content: '',
      }),
    ).toBe(false)
  })
})
