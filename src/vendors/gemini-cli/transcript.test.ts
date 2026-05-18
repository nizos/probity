import { describe, it, expect } from 'vitest'
import { readTranscript } from './transcript.js'

describe('gemini-cli transcript', () => {
  it('parses user prompts and gemini tool calls', async () => {
    const events = await readTranscript(
      'test/fixtures/gemini-cli/session-sample.jsonl',
    )

    expect(events).toEqual([
      { kind: 'prompt', text: 'Hello' },
      {
        kind: 'action',
        tool: 'list_directory',
        input: { dir_path: 'src' },
        output: 'src/index.ts',
        toolUseId: 'tool-1',
      },
      { kind: 'prompt', text: 'Next step' },
    ])
  })

  it('handles gemini text responses (non-tool calls) as non-events', async () => {
    const events = await readTranscript(
      'test/fixtures/gemini-cli/session-sample.jsonl',
    )
    // We only care about prompts and actions for now, consistent with other vendors.
    // Text responses from the AI are usually not events rules reason about.
    expect(events.filter((e) => e.kind === 'prompt')).toHaveLength(2)
  })
})
