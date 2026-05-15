import { describe, it, expect } from 'vitest'

import { readTranscript } from './transcript.js'

describe('claude-code transcript', () => {
  it('pairs a tool_use with its tool_result into a single action event', async () => {
    const events = await readTranscript('test/fixtures/transcripts/basic.jsonl')

    expect(events).toContainEqual({
      kind: 'action',
      tool: 'Bash',
      input: { command: 'npm test' },
      output: '2 tests failed',
      toolUseId: 'tu_1',
    })
  })

  it('emits a prompt event for user text messages', async () => {
    const events = await readTranscript('test/fixtures/transcripts/basic.jsonl')

    expect(events).toContainEqual({ kind: 'prompt', text: 'add a test' })
  })

  it('skips malformed lines and keeps parsing valid ones', async () => {
    const events = await readTranscript(
      'test/fixtures/transcripts/with-malformed-line.jsonl',
    )

    expect(events).toContainEqual({ kind: 'prompt', text: 'hello' })
    expect(events).toContainEqual({
      kind: 'action',
      tool: 'Bash',
      input: { command: 'ls' },
      output: 'ok',
      toolUseId: 'tu_1',
    })
  })

  it('skips content array elements that are not objects', async () => {
    const events = await readTranscript(
      'test/fixtures/transcripts/non-object-content.jsonl',
    )

    expect(events).toEqual([{ kind: 'prompt', text: 'hi' }])
  })

  it('skips tool_use entries whose name or id is not a string', async () => {
    const events = await readTranscript(
      'test/fixtures/transcripts/bad-tool-use.jsonl',
    )

    expect(events).toEqual([{ kind: 'prompt', text: 'hello' }])
  })

  it('drops Edit/Write tool calls whose tool_result was an error (e.g. blocked by a hook), since the file did not actually change', async () => {
    const events = await readTranscript(
      'test/fixtures/transcripts/blocked-edit.jsonl',
    )

    expect(events).toContainEqual({
      kind: 'action',
      tool: 'Bash',
      input: { command: 'npm test' },
      output: '1 test failed',
      toolUseId: 'tu_bash',
    })
    expect(events).toContainEqual({
      kind: 'action',
      tool: 'Edit',
      input: { file_path: 'src/calc.ts', old_string: 'a', new_string: 'b' },
      output: 'The file has been updated successfully',
      toolUseId: 'tu_edit_kept',
    })
    expect(
      events.find(
        (e) => e.kind === 'action' && e.toolUseId === 'tu_edit_blocked',
      ),
    ).toBeUndefined()
  })

  it('returns events in the order they appear in the transcript', async () => {
    const events = await readTranscript(
      'test/fixtures/transcripts/interleaved.jsonl',
    )

    expect(events.map((e) => (e as { kind: string }).kind)).toEqual([
      'action',
      'prompt',
    ])
  })
})
