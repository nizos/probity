import { writeFile } from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, test as baseTest } from 'vitest'

import { makeSandboxDir } from '../../test/helpers/sandbox.js'
import { applyEdit } from './apply-edit.js'

const it = baseTest
  .extend('dir', ({}, { onCleanup }) => makeSandboxDir(onCleanup))
  .extend('makeFile', ({ dir }) => async (content: string) => {
    const filePath = path.join(dir, 'foo.ts')
    await writeFile(filePath, content)
    return filePath
  })

describe('applyEdit', () => {
  it('returns the post-edit content when oldString appears exactly once', async ({
    makeFile,
  }) => {
    const filePath = await makeFile('before\nMARKER\nafter\n')

    const result = await applyEdit({
      filePath,
      oldString: 'MARKER',
      newString: 'REPLACED',
    })

    expect(result).toEqual({ ok: true, content: 'before\nREPLACED\nafter\n' })
  })

  it('fails closed when oldString does not appear in the file (no silent no-op)', async ({
    makeFile,
  }) => {
    const filePath = await makeFile('a fresh file with no marker in it\n')

    const result = await applyEdit({
      filePath,
      oldString: 'MARKER',
      newString: 'REPLACED',
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/not found|no match|MARKER/i)
  })

  it('fails closed when oldString matches more than once and replaceAll is false (mirrors vendor uniqueness contract)', async ({
    makeFile,
  }) => {
    const filePath = await makeFile('one MARKER\ntwo MARKER\nthree MARKER\n')

    const result = await applyEdit({
      filePath,
      oldString: 'MARKER',
      newString: 'REPLACED',
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/unique|multiple|3/i)
  })

  it('replaces every occurrence of oldString when replaceAll is true', async ({
    makeFile,
  }) => {
    const filePath = await makeFile('one MARKER\ntwo MARKER\nthree MARKER\n')

    const result = await applyEdit({
      filePath,
      oldString: 'MARKER',
      newString: 'REPLACED',
      replaceAll: true,
    })

    expect(result).toEqual({
      ok: true,
      content: 'one REPLACED\ntwo REPLACED\nthree REPLACED\n',
    })
  })

  it('matches across CRLF/LF line-ending mismatch (file has CRLF on disk, oldString sent as LF)', async ({
    makeFile,
  }) => {
    const filePath = await makeFile('first\r\nMARKER\r\nlast\r\n')

    const result = await applyEdit({
      filePath,
      oldString: 'first\nMARKER\nlast',
      newString: 'first\nREPLACED\nlast',
    })

    expect(result).toEqual({
      ok: true,
      content: 'first\nREPLACED\nlast\n',
    })
  })

  it('matches across CRLF/LF line-ending mismatch when oldString carries CRLF and the file is LF-only', async ({
    makeFile,
  }) => {
    const filePath = await makeFile('first\nMARKER\nlast\n')

    const result = await applyEdit({
      filePath,
      oldString: 'first\r\nMARKER\r\nlast',
      newString: 'first\r\nREPLACED\r\nlast',
    })

    expect(result).toEqual({
      ok: true,
      content: 'first\nREPLACED\nlast\n',
    })
  })

  it('fails closed when the file does not exist (no silent fallback to newString)', async () => {
    const result = await applyEdit({
      filePath: '/tmp/probity-apply-edit-does-not-exist.ts',
      oldString: 'MARKER',
      newString: 'REPLACED',
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/not.*read|missing|ENOENT/i)
  })
})
