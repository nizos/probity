import { describe, it, expect } from 'vitest'

import { readTranscript } from './transcript.js'

describe('github-copilot transcript', () => {
  it('emits a prompt event for a user.message entry', async () => {
    const events = await readTranscript(
      'test/fixtures/transcripts/copilot-basic.jsonl',
    )

    const prompt = events.find((e) => e.kind === 'prompt')
    expect(prompt?.text).toMatch(/failing test for an addition/i)
  })

  it('pairs tool.execution_start with tool.execution_complete into one action event', async () => {
    const events = await readTranscript(
      'test/fixtures/transcripts/copilot-basic.jsonl',
    )

    const bashAction = events.find(
      (e) => e.kind === 'action' && e.tool === 'bash',
    )
    expect(bashAction?.kind).toBe('action')
    if (bashAction?.kind !== 'action') return
    expect(bashAction.tool).toBe('bash')
    expect(bashAction.output.length).toBeGreaterThan(0)
    expect(bashAction.toolUseId).toMatch(/^call_/)
  })

  it('drops create/edit tool calls whose tool.execution_complete reports success: false (e.g. denied by a hook), since the file did not actually change', async () => {
    const events = await readTranscript(
      'test/fixtures/transcripts/copilot-blocked-edit.jsonl',
    )

    expect(events).toContainEqual(
      expect.objectContaining({
        kind: 'action',
        tool: 'bash',
        toolUseId: 'call_bash',
      }),
    )
    expect(events).toContainEqual(
      expect.objectContaining({
        kind: 'action',
        tool: 'edit',
        toolUseId: 'call_edit_kept',
      }),
    )
    expect(
      events.find(
        (e) => e.kind === 'action' && e.toolUseId === 'call_edit_blocked',
      ),
    ).toBeUndefined()
  })

  it('returns events in the order they appear in the transcript', async () => {
    const events = await readTranscript(
      'test/fixtures/transcripts/copilot-basic.jsonl',
    )

    const firstPrompt = events.findIndex((e) => e.kind === 'prompt')
    const firstAction = events.findIndex((e) => e.kind === 'action')
    expect(firstPrompt).toBeGreaterThanOrEqual(0)
    expect(firstAction).toBeGreaterThanOrEqual(0)
    expect(firstPrompt).toBeLessThan(firstAction)
  })
})
