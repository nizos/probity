import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { createFixture } from 'fs-fixture'
import { describe, expect, it } from 'vitest'

import { parseAction, toResponse } from './adapter.js'

describe('Devin hook actions', () => {
  it('checks the actual exec command without requiring an absent cwd', async () => {
    expect(
      await parseAction({
        tool_name: 'exec',
        tool_input: { command: 'git push --no-verify' },
      }),
    ).toEqual({
      ok: true,
      actions: [{ kind: 'command', command: 'git push --no-verify' }],
    })
  })

  it('checks the complete resulting file for writes and edits', async () => {
    const fixture = await createFixture({
      'cart.py': 'def total(items):\n    return 0\n',
    })
    try {
      const file = path.join(fixture.path, 'cart.py')
      expect(
        await parseAction({
          cwd: fixture.path,
          tool_name: 'write',
          tool_input: {
            file_path: 'cart.py',
            content: 'def total(items):\n    return sum(items)\n',
          },
        }),
      ).toEqual({
        ok: true,
        actions: [
          {
            kind: 'write',
            path: file.replace(/\\/g, '/'),
            content: 'def total(items):\n    return sum(items)\n',
          },
        ],
      })
      expect(
        await parseAction({
          cwd: fixture.path,
          tool_name: 'edit',
          tool_input: {
            file_path: 'cart.py',
            old_string: 'return 0',
            new_string: 'return sum(items)',
          },
        }),
      ).toEqual({
        ok: true,
        actions: [
          {
            kind: 'write',
            path: file.replace(/\\/g, '/'),
            content: 'def total(items):\n    return sum(items)\n',
          },
        ],
      })
      await writeFile(file, 'changed meanwhile')
      expect(
        await parseAction({
          cwd: fixture.path,
          tool_name: 'edit',
          tool_input: {
            file_path: 'cart.py',
            old_string: 'return 0',
            new_string: 'return sum(items)',
          },
        }),
      ).toMatchObject({ ok: false })
    } finally {
      await fixture.rm()
    }
  })

  it('checks every file in a patch, including deletion and rename targets', async () => {
    const cwd = process.cwd()
    const command =
      '*** Begin Patch\n*** Add File: src/cart.py\n+x\n*** Update File: src/item.py\n*** Move to: src/new_item.py\n@@\n-x\n+y\n*** Delete File: src/old.py\n*** End Patch'
    const result = await parseAction({
      cwd,
      tool_name: 'apply_patch',
      tool_input: { patch: command },
    })
    expect(result).toMatchObject({ ok: true })
    if (!result.ok) throw new Error(result.reason)
    expect(
      result.actions.map((action) =>
        action.kind === 'write' ? action.path : '',
      ),
    ).toEqual(
      ['src/cart.py', 'src/item.py', 'src/new_item.py', 'src/old.py'].map((p) =>
        path.resolve(cwd, p).replace(/\\/g, '/'),
      ),
    )
  })

  it.each(['exec', 'write', 'edit', 'apply_patch', 'notebook_edit'])(
    'blocks malformed known %s payloads instead of passing through',
    async (tool_name) => {
      expect(
        await parseAction({ cwd: process.cwd(), tool_name, tool_input: {} }),
      ).toMatchObject({ ok: false })
    },
  )

  it('leaves read-only tools and normal user permission checks alone', async () => {
    expect(
      await parseAction({
        tool_name: 'read',
        tool_input: { file_path: 'cart.py' },
      }),
    ).toMatchObject({ ok: true })
    expect(toResponse({ kind: 'allow' })).toBe('')
    expect(
      JSON.parse(toResponse({ kind: 'block', reason: 'No behavioral red' })),
    ).toEqual({ decision: 'block', reason: 'No behavioral red' })
  })
})
