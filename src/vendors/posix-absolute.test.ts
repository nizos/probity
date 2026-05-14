import { describe, it, expect } from 'vitest'

import { posixAbsolute } from './posix-absolute.js'

describe('posixAbsolute', () => {
  it('resolves a relative path against cwd', () => {
    expect(posixAbsolute('/workspaces/probity', 'src/foo.ts')).toBe(
      '/workspaces/probity/src/foo.ts',
    )
  })

  it('returns a forward-slash path, converting any backslashes in the resolved output', () => {
    expect(posixAbsolute('/proj', 'src\\foo.ts')).toBe('/proj/src/foo.ts')
  })
})
