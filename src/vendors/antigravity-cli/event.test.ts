import { describe, it, expect } from 'vitest'
import { toCanonical } from './event.js'

describe('antigravity-cli event classification', () => {
  it('maps run_command to command event', () => {
    const canonical = toCanonical({
      kind: 'action',
      tool: 'run_command',
      input: { CommandLine: 'npm test', Cwd: '/work' },
      output: 'tests passed',
      toolUseId: '10-0',
    })
    expect(canonical).toEqual({
      kind: 'command',
      command: 'npm test',
      output: 'tests passed',
    })
  })

  it('maps write_to_file to write event', () => {
    const canonical = toCanonical({
      kind: 'action',
      tool: 'write_to_file',
      input: { TargetFile: 'foo.txt', CodeContent: 'hello' },
      output: 'ok',
      toolUseId: '2-0',
    })
    expect(canonical).toEqual({
      kind: 'write',
      path: 'foo.txt',
      content: 'hello',
      output: 'ok',
    })
  })

  it('maps replace_file_content (an edit) to write event with the replacement', () => {
    const canonical = toCanonical({
      kind: 'action',
      tool: 'replace_file_content',
      input: {
        TargetFile: 'foo.txt',
        TargetContent: '    return 1',
        ReplacementContent: '    return 2',
      },
      output: 'ok',
      toolUseId: '4-0',
    })
    expect(canonical).toEqual({
      kind: 'write',
      path: 'foo.txt',
      content: '    return 2',
      output: 'ok',
    })
  })

  it('maps read-only tools (list_dir, grep_search) to other events', () => {
    const canonical = toCanonical({
      kind: 'action',
      tool: 'grep_search',
      input: { Query: 'answer', SearchPath: 'foo.txt' },
      output: '...',
      toolUseId: '8-0',
    })
    expect(canonical).toEqual({
      kind: 'other',
      tool: 'grep_search',
      input: { Query: 'answer', SearchPath: 'foo.txt' },
      output: '...',
    })
  })
})
