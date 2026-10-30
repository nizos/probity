import { readFile, symlink, unlink } from 'node:fs/promises'
import path from 'node:path'
import { createFixture } from 'fs-fixture'
import { describe, expect, it } from 'vitest'

import { preparePayload, readTranscript } from './history.js'

describe('Devin session history', () => {
  it('keeps real command results, writes, prompts and background output in their own session', async () => {
    const fixture = await createFixture({})
    try {
      const base = { cwd: fixture.path, session_id: 'cart-session' }
      await preparePayload({
        ...base,
        hook_event_name: 'UserPromptSubmit',
        prompt: 'Sum item prices',
      })
      await preparePayload({
        ...base,
        hook_event_name: 'PostToolUse',
        tool_name: 'exec',
        tool_input: { command: 'python -m unittest' },
        tool_use_id: 'exec:1',
        tool_response: {
          success: true,
          output: 'AssertionError: 0 != 30\nExit code: 1',
          error: null,
        },
      })
      await preparePayload({
        ...base,
        hook_event_name: 'PostToolUse',
        tool_name: 'get_output',
        tool_input: { shell_id: '42' },
        tool_use_id: 'output:1',
        tool_response: {
          success: true,
          output: '1 failed\nExit code: 1',
          error: null,
        },
      })
      await preparePayload({
        ...base,
        session_id: 'other-session',
        hook_event_name: 'UserPromptSubmit',
        prompt: 'Unrelated task',
      })
      const prepared = await preparePayload({
        ...base,
        hook_event_name: 'PreToolUse',
        tool_name: 'write',
        tool_input: { file_path: 'cart.py', content: 'return sum(items)' },
      })
      const events = await readTranscript(prepared.transcript_path as string)
      expect(events).toEqual([
        { kind: 'prompt', text: 'Sum item prices' },
        {
          kind: 'action',
          tool: 'exec',
          input: { command: 'python -m unittest' },
          output: 'AssertionError: 0 != 30\nExit code: 1',
          toolUseId: 'exec:1',
        },
        {
          kind: 'action',
          tool: 'get_output',
          input: { shell_id: '42' },
          output: '1 failed\nExit code: 1',
          toolUseId: 'output:1',
        },
      ])
      expect(
        await readFile(prepared.transcript_path as string, 'utf8'),
      ).not.toContain('return sum(items)')
    } finally {
      await fixture.rm()
    }
  })

  it('starts with an empty history and refuses session path traversal', async () => {
    const fixture = await createFixture({})
    try {
      const prepared = await preparePayload({
        cwd: fixture.path,
        session_id: 'new-session',
        hook_event_name: 'PreToolUse',
        tool_name: 'exec',
        tool_input: { command: 'python -m unittest' },
      })
      expect(await readTranscript(prepared.transcript_path as string)).toEqual(
        [],
      )
      await expect(
        preparePayload({
          cwd: fixture.path,
          session_id: '../other',
          hook_event_name: 'PreToolUse',
        }),
      ).rejects.toThrow()
      expect(path.dirname(prepared.transcript_path as string)).toBe(
        path.join(fixture.path, '.probity', 'devin'),
      )
    } finally {
      await fixture.rm()
    }
  })

  it('does not append private hook history through a journal symlink', async () => {
    const fixture = await createFixture({ 'outside.txt': 'unchanged' })
    try {
      const base = {
        cwd: fixture.path,
        session_id: 'cart-session',
        hook_event_name: 'PreToolUse',
      }
      const prepared = await preparePayload(base)
      const journal = prepared.transcript_path as string
      await unlink(journal)
      await symlink(path.join(fixture.path, 'outside.txt'), journal)
      await expect(
        preparePayload({
          ...base,
          hook_event_name: 'UserPromptSubmit',
          prompt: 'Private session context',
        }),
      ).rejects.toThrow()
      expect(
        await readFile(path.join(fixture.path, 'outside.txt'), 'utf8'),
      ).toBe('unchanged')
    } finally {
      await fixture.rm()
    }
  })
})
