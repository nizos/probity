import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { parseAction, sessionPath, toResponse } from './adapter.js'

const FIXTURES = path.join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'test',
  'fixtures',
  'opencode',
)

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(FIXTURES, name), 'utf8'))
}

describe('parseAction', () => {
  it('maps a Bash payload to a command action', async () => {
    const result = await parseAction(fixture('bash-npm-test.json'))
    expect(result).toEqual({
      ok: true,
      actions: [{ kind: 'command', command: 'npm test' }],
    })
  })

  it('maps a Write payload to a write action with resolved path', async () => {
    const result = await parseAction(fixture('write-new-file.json'))
    expect(result).toEqual({
      ok: true,
      actions: [
        {
          kind: 'write',
          path: '/workspaces/probity/src/hello.ts',
          content: "export function hello() { return 'world' }\n",
        },
      ],
    })
  })

  it('passes through an unknown tool as a no-op command', async () => {
    const result = await parseAction(fixture('read-passthrough.json'))
    expect(result).toEqual({
      ok: true,
      actions: [{ kind: 'command', command: '' }],
    })
  })

  it('rejects a malformed known-tool payload', async () => {
    const result = await parseAction({
      tool: 'Bash',
      sessionID: 's1',
      callID: 'c1',
      args: {},
    })
    expect(result.ok).toBe(false)
  })

  it('rejects a Write payload with missing filePath', async () => {
    const result = await parseAction({
      tool: 'Write',
      sessionID: 's1',
      callID: 'c1',
      args: { content: 'hello' },
      cwd: '/tmp',
    })
    expect(result.ok).toBe(false)
  })

  it('handles case-insensitive tool names via passthrough', async () => {
    // Lowercase tool names that are not in the known set pass through
    const result = await parseAction({
      tool: 'read',
      sessionID: 's1',
      callID: 'c1',
      args: {},
    })
    expect(result).toEqual({
      ok: true,
      actions: [{ kind: 'command', command: '' }],
    })
  })
})

describe('toResponse', () => {
  it('produces JSON with decision: block on a block decision', () => {
    const response = toResponse({ kind: 'block', reason: 'forbidden' })
    expect(JSON.parse(response)).toEqual({
      decision: 'block',
      reason: 'forbidden',
    })
  })

  it('produces an empty string on an allow decision', () => {
    expect(toResponse({ kind: 'allow' })).toBe('')
  })
})

describe('sessionPath', () => {
  it('extracts transcript_path from the payload', () => {
    expect(
      sessionPath({
        tool: 'Bash',
        transcript_path: '/tmp/probity-transcripts/s1.jsonl',
      }),
    ).toBe('/tmp/probity-transcripts/s1.jsonl')
  })

  it('returns undefined when transcript_path is absent', () => {
    expect(sessionPath({ tool: 'Bash' })).toBeUndefined()
  })
})
