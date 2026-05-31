import { readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, test as baseTest } from 'vitest'

import { makeSandboxDir } from '../../../test/helpers/sandbox.js'
import type { Action } from '../../types.js'
import { parseAs } from '../../utils/parse-as.js'
import type { ParseActionResult } from '../adapter.js'
import {
  parseAction,
  sessionPath,
  toResponse,
  type ResponseShape,
} from './adapter.js'

type Payload = {
  cwd?: string
  tool_name: string
  tool_input: {
    file_path?: string
    content?: string
    command?: string
    new_string?: string
  }
}

const it = baseTest
  .extend('dir', ({}, { onCleanup }) => makeSandboxDir(onCleanup))
  .extend('makeFile', ({ dir }) => async (content: string, name = 'foo.ts') => {
    const filePath = path.join(dir, name)
    await writeFile(filePath, content)
    return filePath
  })

describe('claude-code adapter', () => {
  it('parseAction returns an ok result with the typed action for a valid payload', async () => {
    const result = await parseAction({
      cwd: '/workspaces/probity',
      tool_name: 'Write',
      tool_input: {
        file_path: '/workspaces/probity/src/UpperCase.ts',
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

  it('extracts the file path from a Write payload as an absolute POSIX path', async () => {
    const { action } = await setup('write-new-file.json')

    expect(action).toMatchObject({
      path: '/workspaces/probity/src/userProfile.ts',
    })
  })

  it('tags the action type as write for a Write payload', async () => {
    const { action } = await setup('write-new-file.json')

    expect(action.kind).toBe('write')
  })

  it('extracts the content from a Write payload', async () => {
    const { action, payload } = await setup('write-new-file.json')

    expect(action).toMatchObject({ content: payload.tool_input.content })
  })

  it('tags the action type as command for a Bash payload', async () => {
    const { action } = await setup('bash-npm-install.json')

    expect(action.kind).toBe('command')
  })

  it('extracts the command text from a Bash payload', async () => {
    const { action, payload } = await setup('bash-npm-install.json')

    expect(action).toMatchObject({ command: payload.tool_input.command })
  })

  it('Edit action carries the full post-edit file content (replace old_string with new_string)', async ({
    dir,
    makeFile,
  }) => {
    const filePath = await makeFile('before\nMARKER\nafter\n')

    const result = await parseAction({
      cwd: dir,
      tool_name: 'Edit',
      tool_input: {
        file_path: filePath,
        old_string: 'MARKER',
        new_string: 'REPLACED',
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

  it('Edit succeeds when the on-disk file is CRLF and the agent sent old_string as LF (Windows-typical)', async ({
    dir,
    makeFile,
  }) => {
    const filePath = await makeFile(
      ['alpha', 'MARKER', 'omega', ''].join('\r\n'),
    )

    const result = await parseAction({
      cwd: dir,
      tool_name: 'Edit',
      tool_input: {
        file_path: filePath,
        old_string: 'alpha\nMARKER\nomega',
        new_string: 'alpha\nREPLACED\nomega',
      },
    })

    expect(result.ok).toBe(true)
  })

  it('Edit honors replace_all=true when old_string occurs more than once', async ({
    dir,
    makeFile,
  }) => {
    const filePath = await makeFile('oldName(); oldName();\n')

    const result = await parseAction({
      cwd: dir,
      tool_name: 'Edit',
      tool_input: {
        file_path: filePath,
        old_string: 'oldName',
        new_string: 'newName',
        replace_all: true,
      },
    })

    expect(result).toEqual({
      ok: true,
      action: {
        kind: 'write',
        path: filePath,
        content: 'newName(); newName();\n',
      },
    })
  })

  it('Edit fails closed when old_string is not present in the file (no silent no-op)', async ({
    dir,
    makeFile,
  }) => {
    const filePath = await makeFile('a fresh file with no marker in it\n')

    const result = await parseAction({
      cwd: dir,
      tool_name: 'Edit',
      tool_input: {
        file_path: filePath,
        old_string: 'MARKER_THAT_IS_ABSENT',
        new_string: 'REPLACED',
      },
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/not found|MARKER_THAT_IS_ABSENT/)
  })

  it('extracts the file path from an Edit payload as an absolute POSIX path', async ({
    dir,
    makeFile,
  }) => {
    const filePath = await makeFile(
      'Process discipline for AI coding agents.\n',
      'README.md',
    )

    const action = ok(
      await parseAction({
        cwd: dir,
        tool_name: 'Edit',
        tool_input: {
          file_path: filePath,
          old_string: 'Process discipline for AI coding agents.',
          new_string: 'Process discipline for AI coding agents. 🚀',
        },
      }),
    )

    expect(action).toMatchObject({ path: filePath })
  })

  it('preserves an absolute file_path emitted by the agent', async () => {
    const action = ok(
      await parseAction({
        cwd: '/workspaces/probity',
        tool_name: 'Write',
        tool_input: {
          file_path: '/workspaces/probity/src/UpperCase.ts',
          content: 'x',
        },
      }),
    )

    expect(action).toMatchObject({
      kind: 'write',
      path: '/workspaces/probity/src/UpperCase.ts',
    })
  })

  it('fails closed when a Write payload omits cwd (vendors reliably emit it; absence is malformed)', async () => {
    const result = await parseAction({
      tool_name: 'Write',
      tool_input: {
        file_path: '/workspaces/probity/src/UpperCase.ts',
        content: 'x',
      },
    })

    expect(result.ok).toBe(false)
  })

  it('preserves an absolute file_path even when it sits outside cwd', async () => {
    const action = ok(
      await parseAction({
        cwd: '/workspaces/probity',
        tool_name: 'Write',
        tool_input: { file_path: '/etc/passwd', content: 'x' },
      }),
    )

    expect(action).toMatchObject({ kind: 'write', path: '/etc/passwd' })
  })

  it('returns no opinion (empty stdout) on an allow decision so normal permission flow takes over', () => {
    expect(toResponse({ kind: 'allow' })).toBe('')
  })

  it('builds a deny response from a block decision', () => {
    const response = parseAs<ResponseShape>(
      toResponse({ kind: 'block', reason: 'out of scope' }),
    )

    expect(response.hookSpecificOutput.permissionDecision).toBe('deny')
  })

  it('preserves the decision reason in a block response', () => {
    const response = parseAs<ResponseShape>(
      toResponse({ kind: 'block', reason: 'out of scope' }),
    )

    expect(response.hookSpecificOutput.permissionDecisionReason).toBe(
      'out of scope',
    )
  })

  it('rejects a Bash payload missing the command field', async () => {
    const result = await parseAction({ tool_name: 'Bash', tool_input: {} })

    expect(result.ok).toBe(false)
  })

  it('passes through an unsupported tool_name as a no-op so unknown tools are not blocked', async () => {
    const action = ok(
      await parseAction({
        tool_name: 'MultiEdit',
        tool_input: { file_path: 'x', edits: [] },
      }),
    )

    expect(action).toEqual({ kind: 'command', command: '' })
  })

  it('returns the transcript_path from the payload as the session path', () => {
    expect(sessionPath({ transcript_path: '/some/transcript.jsonl' })).toBe(
      '/some/transcript.jsonl',
    )
  })
})

async function setup(fixtureName: string) {
  const payload = parseAs<Payload>(
    readFileSync(`test/fixtures/claude-code/${fixtureName}`, 'utf8'),
  )
  const action = ok(await parseAction(payload))
  return { action, payload }
}

function ok(result: ParseActionResult): Action {
  if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`)
  return result.action
}
