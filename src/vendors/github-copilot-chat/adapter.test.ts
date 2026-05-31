import { readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { PreToolUseHookSpecificOutput } from '@anthropic-ai/claude-agent-sdk'
import { describe, expect, test as baseTest } from 'vitest'

import { makeSandboxDir } from '../../../test/helpers/sandbox.js'
import type { Action } from '../../types.js'
import { parseAs } from '../../utils/parse-as.js'
import type { ParseActionResult } from '../adapter.js'
import { parseAction, sessionPath, toResponse } from './adapter.js'

type Payload = {
  cwd?: string
  tool_name: string
  tool_input: {
    command?: string
    content?: string
    newString?: string
    filePath?: string
  }
}

type DenyResponse = {
  hookSpecificOutput: PreToolUseHookSpecificOutput
}

const it = baseTest
  .extend('dir', ({}, { onCleanup }) => makeSandboxDir(onCleanup))
  .extend('makeFile', ({ dir }) => async (content: string) => {
    const filePath = path.join(dir, 'foo.ts')
    await writeFile(filePath, content)
    return filePath
  })

describe('github-copilot-chat adapter', () => {
  it('parseAction returns an ok result with the typed action for a valid payload', async () => {
    const result = await parseAction({
      cwd: '/workspaces/probity',
      tool_name: 'create_file',
      tool_input: {
        filePath: '/workspaces/probity/src/UpperCase.ts',
        content: 'x',
      },
    })

    expect(result).toEqual({
      ok: true,
      action: {
        kind: 'write',
        path: '/workspaces/probity/src/UpperCase.ts',
        content: 'x',
      },
    })
  })

  it('returns the transcript_path from the payload as the session path', () => {
    expect(
      sessionPath({ transcript_path: '/some/chat-transcript.jsonl' }),
    ).toBe('/some/chat-transcript.jsonl')
  })

  it('returns undefined for a malformed payload rather than throwing', () => {
    expect(sessionPath(null)).toBeUndefined()
  })

  it('wraps the deny response in hookSpecificOutput so Chat honors it (flat shape is silently ignored)', () => {
    const response = parseAs<DenyResponse>(
      toResponse({ kind: 'block', reason: 'no failing test' }),
    )

    expect(response).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: 'no failing test',
      },
    })
  })

  it('returns no opinion (empty stdout) on an allow decision so Chat keeps its built-in confirmations', () => {
    expect(toResponse({ kind: 'allow' })).toBe('')
  })

  it('tags the action type as command for a run_in_terminal payload', async () => {
    const { action } = await setup('pre-run-in-terminal.json')

    expect(action.kind).toBe('command')
  })

  it('extracts the command text from a run_in_terminal payload', async () => {
    const { action, payload } = await setup('pre-run-in-terminal.json')

    expect(action).toMatchObject({ command: payload.tool_input.command })
  })

  it('tags a create_file payload as a write action', async () => {
    const { action } = await setup('pre-create-file.json')

    expect(action.kind).toBe('write')
  })

  it('maps create_file payload filePath (absolute POSIX) + content onto the write action', async () => {
    const { action, payload } = await setup('pre-create-file.json')

    expect(action).toMatchObject({
      path: '/workspaces/probity/src/shopping-cart.test.ts',
      content: payload.tool_input.content,
    })
  })

  it('replace_string_in_file action carries the full post-edit file content (replace oldString with newString)', async ({
    makeFile,
  }) => {
    const filePath = await makeFile('before\nMARKER\nafter\n')

    const result = await parseAction({
      cwd: '/workspaces/probity',
      tool_name: 'replace_string_in_file',
      tool_input: {
        filePath,
        oldString: 'MARKER',
        newString: 'REPLACED',
      },
    })

    expect(result).toEqual({
      ok: true,
      action: {
        kind: 'write',
        path: filePath,
        content: 'before\nREPLACED\nafter\n',
      },
    })
  })

  it('replace_string_in_file fails closed when oldString is not present in the file (no silent no-op)', async ({
    makeFile,
  }) => {
    const filePath = await makeFile('a fresh file with no marker in it\n')

    const result = await parseAction({
      cwd: '/workspaces/probity',
      tool_name: 'replace_string_in_file',
      tool_input: {
        filePath,
        oldString: 'MARKER_THAT_IS_ABSENT',
        newString: 'REPLACED',
      },
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/not found|MARKER_THAT_IS_ABSENT/)
  })

  it('preserves an absolute create_file filePath emitted by the agent', async () => {
    const action = ok(
      await parseAction({
        cwd: '/workspaces/probity',
        tool_name: 'create_file',
        tool_input: {
          filePath: '/workspaces/probity/src/UpperCase.ts',
          content: 'x',
        },
      }),
    )

    expect(action).toMatchObject({
      kind: 'write',
      path: '/workspaces/probity/src/UpperCase.ts',
    })
  })

  it('fails closed when a create_file payload omits cwd (vendors reliably emit it; absence is malformed)', async () => {
    const result = await parseAction({
      tool_name: 'create_file',
      tool_input: {
        filePath: '/workspaces/probity/src/UpperCase.ts',
        content: 'x',
      },
    })

    expect(result.ok).toBe(false)
  })

  it('fails closed when a replace_string_in_file payload omits cwd (vendors reliably emit it; absence is malformed)', async () => {
    const result = await parseAction({
      tool_name: 'replace_string_in_file',
      tool_input: {
        filePath: '/workspaces/probity/src/UpperCase.ts',
        newString: 'x',
      },
    })

    expect(result.ok).toBe(false)
  })

  it('passes through read_file as a no-op so reads are not blocked by an unknown-tool error', async () => {
    const payload = parseAs<Payload>(
      readFileSync(
        'test/fixtures/github-copilot-chat/pre-read-file.json',
        'utf8',
      ),
    )

    expect(ok(await parseAction(payload))).toEqual({
      kind: 'command',
      command: '',
    })
  })

  it('passes through list_dir as a no-op so listings are not blocked by an unknown-tool error', async () => {
    const payload = parseAs<Payload>(
      readFileSync(
        'test/fixtures/github-copilot-chat/pre-list-dir.json',
        'utf8',
      ),
    )

    expect(ok(await parseAction(payload))).toEqual({
      kind: 'command',
      command: '',
    })
  })

  it('passes through any unknown tool_name (catchall, not a hardcoded list of read tools)', async () => {
    const action = ok(
      await parseAction({
        tool_name: 'some_future_tool',
        tool_input: { whatever: true },
      }),
    )

    expect(action).toEqual({ kind: 'command', command: '' })
  })
})

async function setup(fixtureName: string) {
  const payload = parseAs<Payload>(
    readFileSync(`test/fixtures/github-copilot-chat/${fixtureName}`, 'utf8'),
  )
  const action = ok(await parseAction(payload))
  return { action, payload }
}

function ok(result: ParseActionResult): Action {
  if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`)
  return result.action
}
