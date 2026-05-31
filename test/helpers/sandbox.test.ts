import { existsSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { makeSandboxDir } from './sandbox.js'

describe('makeSandboxDir', () => {
  it('creates a tempdir and registers an onCleanup that removes it', async () => {
    const cleanups: Array<() => void | Promise<void>> = []
    const onCleanup = (fn: () => void | Promise<void>) => cleanups.push(fn)

    const dir = await makeSandboxDir(onCleanup)

    expect(existsSync(dir)).toBe(true)
    for (const fn of cleanups) await fn()
    expect(existsSync(dir)).toBe(false)
  })
})
