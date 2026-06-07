import { describe, it, expect } from 'vitest'
import type { RawSessionEvent } from '../../types.js'
import { readTranscript } from './transcript.js'

// Runs against a verbatim agy session (only the home path sanitized) that
// covers writes, an edit, reads, commands, a failed-and-retried write whose
// result is a SYSTEM ERROR_MESSAGE step, and a command that exits non-zero.
describe('antigravity-cli transcript', () => {
  it('reads a captured agy session', async () => {
    const events = await readTranscript(
      'test/fixtures/antigravity-cli/real-session.jsonl',
    )
    const actions = events.filter(
      (e): e is Extract<RawSessionEvent, { kind: 'action' }> =>
        e.kind === 'action',
    )

    const prompt = events[0]
    if (prompt?.kind !== 'prompt') throw new Error('expected a prompt first')
    expect(prompt.text).not.toContain('<USER_REQUEST>')
    expect(prompt.text).toContain('create a file run.txt')

    // Each call is paired with its own following result, across every result
    // type — including the write whose result is a SYSTEM ERROR_MESSAGE (5-0).
    expect(actions.map((a) => `${a.tool}#${a.toolUseId}`)).toEqual([
      'list_dir#2-0',
      'write_to_file#5-0',
      'write_to_file#7-0',
      'write_to_file#9-0',
      'replace_file_content#11-0',
      'run_command#13-0',
      'replace_file_content#15-0',
      'run_command#17-0',
      'replace_file_content#19-0',
      'run_command#21-0',
      'replace_file_content#23-0',
      'view_file#25-0',
    ])
    expect(actions.every((a) => a.output !== '')).toBe(true)
    expect(actions.find((a) => a.toolUseId === '5-0')?.output).toContain(
      'Error invalid tool call',
    )
    expect(
      actions.some((a) => a.output.includes('failed with exit code: 1')),
    ).toBe(true)
  })
})
