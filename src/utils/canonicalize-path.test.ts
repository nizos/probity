import { mkdir, realpath, symlink } from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, test as baseTest } from 'vitest'

import { makeSandboxDir } from '../../test/helpers/sandbox.js'
import { canonicalizePath } from './canonicalize-path.js'

const it = baseTest.extend('dir', ({}, { onCleanup }) =>
  makeSandboxDir(onCleanup),
)

describe('canonicalizePath', () => {
  it('resolves a path that reaches an existing file through a symlinked ancestor', async ({
    dir,
  }) => {
    await mkdir(path.join(dir, 'real/src'), { recursive: true })
    await symlink(path.join(dir, 'real'), path.join(dir, 'link'))

    const canonical = canonicalizePath(path.join(dir, 'link/src'))

    expect(canonical).toBe(await realpath(path.join(dir, 'real/src')))
  })

  it('resolves the symlinked ancestor of a file that does not exist yet', async ({
    dir,
  }) => {
    await mkdir(path.join(dir, 'real/src'), { recursive: true })
    await symlink(path.join(dir, 'real'), path.join(dir, 'link'))

    const canonical = canonicalizePath(path.join(dir, 'link/src/new/deep.ts'))

    expect(canonical).toBe(
      `${await realpath(path.join(dir, 'real/src'))}/new/deep.ts`,
    )
  })

  it('returns a forward-slash path, converting any backslashes the resolver returns once the walk reaches the real ancestor', () => {
    const resolve = (p: string) => {
      if (p !== '/proj/link/src') throw enoent()
      return 'C:\\proj\\real\\src'
    }

    const canonical = canonicalizePath('/proj/link/src/new/deep.ts', resolve)

    expect(canonical).toBe('C:/proj/real/src/new/deep.ts')
  })

  it('does not produce a double slash when only the filesystem root exists', () => {
    const resolve = (p: string) => {
      if (p === '/') return '/'
      throw enoent()
    }

    const canonical = canonicalizePath('/nonexistent/sub/foo.ts', resolve)

    expect(canonical).toBe('/nonexistent/sub/foo.ts')
  })

  it('converts a backslash inside an unresolved tail segment (POSIX path.dirname does not split on it)', () => {
    const resolve = (p: string) => {
      if (p !== '/tmp/xxx') throw enoent()
      return '/tmp/xxx'
    }

    const canonical = canonicalizePath(
      '/tmp/xxx/win\\style/src/foo.ts',
      resolve,
    )

    expect(canonical).toBe('/tmp/xxx/win/style/src/foo.ts')
  })
})

function enoent(): NodeJS.ErrnoException {
  return Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
}
