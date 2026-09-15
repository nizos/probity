import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { readTranscript } from './transcript.js'

const FIXTURES = path.join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'test',
  'fixtures',
  'opencode',
)

describe('readTranscript', () => {
  it('reads a basic transcript with prompt, write, and bash', async () => {
    const events = await readTranscript(
      path.join(FIXTURES, 'transcript-basic.jsonl'),
    )
    expect(events).toHaveLength(3)
    expect(events[0]).toEqual({
      kind: 'prompt',
      text: 'write a test for the add function',
    })
    expect(events[1]).toMatchObject({
      kind: 'action',
      tool: 'Write',
      output: 'File written',
    })
    expect(events[2]).toMatchObject({
      kind: 'action',
      tool: 'Bash',
      input: { command: 'npm test' },
      output: 'FAIL: add is not defined',
    })
  })

  it('emits pending tools as actions with empty output', async () => {
    const events = await readTranscript(
      path.join(FIXTURES, 'transcript-pending.jsonl'),
    )
    const action = events.find((e) => e.kind === 'action')
    expect(action).toBeDefined()
    expect(action).toMatchObject({ kind: 'action', output: '' })
  })

  it('emits error tools with Error: prefix in output', async () => {
    const events = await readTranscript(
      path.join(FIXTURES, 'transcript-error.jsonl'),
    )
    const action = events.find((e) => e.kind === 'action')
    expect(action).toBeDefined()
    expect(action).toMatchObject({
      kind: 'action',
      output: 'Error: Process exited with code 1',
    })
  })

  it('returns an empty array for a missing file', async () => {
    const events = await readTranscript('/nonexistent/path.jsonl')
    expect(events).toEqual([])
  })

  it('skips unknown part types like reasoning', async () => {
    const events = await readTranscript(
      path.join(FIXTURES, 'transcript-mixed-parts.jsonl'),
    )
    // Should have: 1 prompt, 1 bash action. No reasoning or assistant text.
    const prompts = events.filter((e) => e.kind === 'prompt')
    const actions = events.filter((e) => e.kind === 'action')
    expect(prompts).toHaveLength(1)
    expect(actions).toHaveLength(1)
    expect(actions[0]).toMatchObject({ kind: 'action', tool: 'Bash' })
  })

  it('skips assistant text parts', async () => {
    const events = await readTranscript(
      path.join(FIXTURES, 'transcript-mixed-parts.jsonl'),
    )
    // msg_3 has an assistant text part — should not appear as a prompt
    const prompts = events.filter((e) => e.kind === 'prompt')
    expect(prompts).toHaveLength(1)
    expect(prompts[0]!.text).toBe('help me debug')
  })
})
