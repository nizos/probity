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

  it('matches a write reported through a symlink against a glob anchored at the resolved path', () => {
    expect(
      actionMatchesFilesScope(
        ['/real/src/**'],
        { kind: 'write', path: '/link/src/foo.ts', content: '' },
        (p) => p.replace('/link/', '/real/'),
      ),
    ).toBe(true)
  })

  it('keeps a write in scope when the symlink resolves out of the glob', () => {
    expect(
      actionMatchesFilesScope(
        ['/real/src/**'],
        { kind: 'write', path: '/real/src/linked/foo.ts', content: '' },
        () => '/elsewhere/foo.ts',
      ),
    ).toBe(true)
  })

  it('keeps a negated subtree excluded for a write reached through a symlink', () => {
    expect(
      actionMatchesFilesScope(
        ['/canon/src/**', '!/canon/src/generated/**'],
        {
          kind: 'write',
          path: '/alias/src/generated/foo.ts',
          content: '',
        },
        (p) => p.replace('/alias/', '/canon/'),
      ),
    ).toBe(false)
  })

  // An in-tree symlink can resolve an explicitly excluded reported path
  // to an included canonical one; the block still applies. This is the
  // accepted trade-off: an authoritative reported-path exclusion was
  // tried and reverted (see git history) because it reopened a far more
  // common fail-open — a workspace symlink like `node_modules/pkg` that
  // resolves into `src/**` would silently skip a `!**/node_modules/**`
  // exclusion meant for real vendor code.
  it('applies the block when an in-tree symlink resolves an excluded reported path to an included one', () => {
    expect(
      actionMatchesFilesScope(
        ['/repo/src/**', '!/repo/src/excluded/**'],
        {
          kind: 'write',
          path: '/repo/src/excluded/link/foo.ts',
          content: '',
        },
        () => '/repo/src/allowed/foo.ts',
      ),
    ).toBe(true)
  })

  it('applies the block when a workspace symlink resolves an excluded path into the included tree', () => {
    expect(
      actionMatchesFilesScope(
        ['src/**/*.ts', '!**/node_modules/**'],
        { kind: 'write', path: 'node_modules/pkg/foo.ts', content: '' },
        () => 'src/foo.ts',
      ),
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
