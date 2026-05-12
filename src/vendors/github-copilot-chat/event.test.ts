import { describe, it, expect } from 'vitest'

import { toCanonical } from './event.js'

describe('toCanonical (github-copilot-chat)', () => {
  it('passes prompt events through unchanged', () => {
    const result = toCanonical({ kind: 'prompt', text: 'hi' })

    expect(result).toEqual({ kind: 'prompt', text: 'hi' })
  })

  it('classifies a run_in_terminal action as a command event', () => {
    const result = toCanonical({
      kind: 'action',
      tool: 'run_in_terminal',
      input: { command: 'npm test', explanation: 'Run tests' },
      output: 'PASS',
      toolUseId: 'call_1',
    })

    expect(result).toEqual({
      kind: 'command',
      command: 'npm test',
      output: 'PASS',
    })
  })

  it('classifies a create_file action as a write event', () => {
    const result = toCanonical({
      kind: 'action',
      tool: 'create_file',
      input: { filePath: '/abs/src/calc.ts', content: 'export const x = 1' },
      output: 'created',
      toolUseId: 'call_2',
    })

    expect(result).toEqual({
      kind: 'write',
      path: '/abs/src/calc.ts',
      content: 'export const x = 1',
      output: 'created',
    })
  })

  it('classifies a replace_string_in_file action as a write event using newString as content', () => {
    const result = toCanonical({
      kind: 'action',
      tool: 'replace_string_in_file',
      input: {
        filePath: '/abs/src/calc.ts',
        oldString: 'old',
        newString: 'new',
      },
      output: 'edited',
      toolUseId: 'call_edit',
    })

    expect(result).toEqual({
      kind: 'write',
      path: '/abs/src/calc.ts',
      content: 'new',
      output: 'edited',
    })
  })

  it('classifies an unrecognized tool as an other event, preserving raw input', () => {
    const result = toCanonical({
      kind: 'action',
      tool: 'read_file',
      input: { filePath: '/abs/src/calc.ts' },
      output: 'export const x = 1',
      toolUseId: 'call_3',
    })

    expect(result).toEqual({
      kind: 'other',
      tool: 'read_file',
      input: { filePath: '/abs/src/calc.ts' },
      output: 'export const x = 1',
    })
  })
})
