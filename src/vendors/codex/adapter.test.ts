import { readFileSync } from 'node:fs'

import { describe, it, expect } from 'vitest'

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
  tool_input: { command?: string }
}

describe('codex adapter', () => {
  it('parseAction returns an ok result with the typed action for a valid payload', async () => {
    const result = await parseAction({
      cwd: '/workspaces/probity',
      tool_name: 'apply_patch',
      tool_input: {
        command:
          '*** Begin Patch\n*** Add File: /workspaces/probity/src/UpperCase.ts\n+x\n*** End Patch\n',
      },
    })

    expect(result).toEqual({
      ok: true,
      actions: [
        {
          kind: 'write',
          path: '/workspaces/probity/src/UpperCase.ts',
          content:
            '*** Add File: /workspaces/probity/src/UpperCase.ts\n+x\n*** End Patch\n',
        },
      ],
    })
  })

  it('tags the action type as command for a Bash payload', async () => {
    const { action } = await setup('pre-bash-pwd.json')

    expect(action.kind).toBe('command')
  })

  it('extracts the command text from a Bash payload', async () => {
    const { action, payload } = await setup('pre-bash-pwd.json')

    expect(action).toMatchObject({ command: payload.tool_input.command })
  })

  it('builds a block response as {"decision":"block","reason":...}', () => {
    const response = parseAs<ResponseShape>(
      toResponse({ kind: 'block', reason: 'no failing test' }),
    )

    expect(response).toEqual({
      decision: 'block',
      reason: 'no failing test',
    })
  })

  it('builds an empty allow response (exit 0 + empty stdout = allow in Codex)', () => {
    expect(toResponse({ kind: 'allow' })).toBe('')
  })

  it('rejects a malformed apply_patch payload (missing command field)', async () => {
    const result = await parseAction({
      tool_name: 'apply_patch',
      tool_input: { patch: 'diff' },
    })

    expect(result.ok).toBe(false)
  })

  it('rejects an apply_patch command without an Add/Update/Delete File header', async () => {
    const result = await parseAction({
      tool_name: 'apply_patch',
      tool_input: { command: 'just a string with no header' },
    })

    expect(result.ok).toBe(false)
  })

  it('maps an apply_patch payload to a write action with absolute POSIX path + patch content', async () => {
    const payload = parseAs<Payload>(
      readFileSync('test/fixtures/codex/pre-apply-patch.json', 'utf8'),
    )

    const action = ok(await parseAction(payload))

    expect(action.kind).toBe('write')
    if (action.kind !== 'write') throw new Error('expected write')
    expect(action.path).toBe('/workspaces/probity/src/calculator.ts')
    expect(action.content).not.toContain('*** Begin Patch')
    expect(action.content).toContain('*** Add File:')
  })

  it('preserves an absolute apply_patch header path emitted by the agent', async () => {
    const action = ok(
      await parseAction({
        cwd: '/workspaces/probity',
        tool_name: 'apply_patch',
        tool_input: {
          command:
            '*** Begin Patch\n*** Add File: /workspaces/probity/src/UpperCase.ts\n+x\n*** End Patch\n',
        },
      }),
    )

    expect(action).toMatchObject({
      kind: 'write',
      path: '/workspaces/probity/src/UpperCase.ts',
    })
  })

  it('emits one write action per file in a multi-file apply_patch (files 2..N must not be skipped)', async () => {
    const result = await parseAction({
      cwd: '/workspaces/probity',
      tool_name: 'apply_patch',
      tool_input: {
        command:
          '*** Begin Patch\n' +
          '*** Add File: src/a.ts\n+a\n' +
          '*** Add File: src/secret/b.ts\n+b\n' +
          '*** End Patch\n',
      },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.actions).toEqual([
      {
        kind: 'write',
        path: '/workspaces/probity/src/a.ts',
        content: '*** Add File: src/a.ts\n+a\n',
      },
      {
        kind: 'write',
        path: '/workspaces/probity/src/secret/b.ts',
        content: '*** Add File: src/secret/b.ts\n+b\n*** End Patch\n',
      },
    ])
  })

  it('fails closed when an apply_patch payload omits cwd (vendors reliably emit it; absence is malformed)', async () => {
    const result = await parseAction({
      tool_name: 'apply_patch',
      tool_input: {
        command:
          '*** Begin Patch\n*** Add File: /workspaces/probity/src/UpperCase.ts\n+x\n*** End Patch\n',
      },
    })

    expect(result.ok).toBe(false)
  })

  it('passes through an unsupported tool_name as a no-op so unknown tools are not blocked', async () => {
    const action = ok(
      await parseAction({
        tool_name: 'some_future_tool',
        tool_input: { whatever: true },
      }),
    )

    expect(action).toEqual({ kind: 'command', command: '' })
  })

  it('returns the transcript_path from the payload as the session path', () => {
    expect(
      sessionPath({ transcript_path: '/some/codex-transcript.jsonl' }),
    ).toBe('/some/codex-transcript.jsonl')
  })
})

async function setup(fixtureName: string) {
  const payload = parseAs<Payload>(
    readFileSync(`test/fixtures/codex/${fixtureName}`, 'utf8'),
  )
  const action = ok(await parseAction(payload))
  return { action, payload }
}

function ok(result: ParseActionResult): Action {
  if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`)
  if (result.actions.length !== 1) {
    throw new Error(`expected exactly one action, got ${result.actions.length}`)
  }
  return result.actions[0]!
}
