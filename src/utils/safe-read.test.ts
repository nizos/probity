import { symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, test as baseTest } from 'vitest'

import { makeSandboxDir } from '../../test/helpers/sandbox.js'
import { safeReadCapped } from './safe-read.js'

const it = baseTest.extend('dir', ({}, { onCleanup }) =>
  makeSandboxDir(onCleanup),
)

describe('safeReadCapped', () => {
  it('returns absent for a non-existent path', async ({ dir }) => {
    const result = await safeReadCapped(path.join(dir, 'nope.txt'))

    expect(result).toEqual({ kind: 'absent' })
  })

  it('returns present with the file content for an existing readable file', async ({
    dir,
  }) => {
    const file = path.join(dir, 'hello.txt')
    await writeFile(file, 'hello world')

    const result = await safeReadCapped(file)

    expect(result).toEqual({ kind: 'present', content: 'hello world' })
  })

  it('returns unknown when the final path component is a symlink (O_NOFOLLOW refuses the open)', async ({
    dir,
  }) => {
    const real = path.join(dir, 'real.txt')
    const link = path.join(dir, 'link.txt')
    await writeFile(real, 'sensitive')
    await symlink(real, link)

    const result = await safeReadCapped(link)

    expect(result).toEqual({ kind: 'unknown' })
  })

  it('returns unknown when the file exceeds the maxBytes cap', async ({
    dir,
  }) => {
    const file = path.join(dir, 'big.txt')
    await writeFile(file, 'x'.repeat(200))

    const result = await safeReadCapped(file, { maxBytes: 100 })

    expect(result).toEqual({ kind: 'unknown' })
  })
})
