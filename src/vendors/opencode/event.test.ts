import { describe, expect, it } from 'vitest'

import type { RawSessionEvent } from '../../types.js'
import { toCanonical } from './event.js'

describe('toCanonical', () => {
  it('passes through prompt events', () => {
    const event: RawSessionEvent = { kind: 'prompt', text: 'hello' }
    expect(toCanonical(event)).toEqual({ kind: 'prompt', text: 'hello' })
  })

  it('classifies Bash as a command', () => {
    const event: RawSessionEvent = {
      kind: 'action',
      tool: 'Bash',
      input: { command: 'npm test' },
      output: 'PASS',
      toolUseId: 'call_1',
    }
    expect(toCanonical(event)).toEqual({
      kind: 'command',
      command: 'npm test',
      output: 'PASS',
    })
  })

  it('classifies Write as a write', () => {
    const event: RawSessionEvent = {
      kind: 'action',
      tool: 'Write',
      input: { filePath: '/src/index.ts', content: 'hello' },
      output: 'File written',
      toolUseId: 'call_2',
    }
    expect(toCanonical(event)).toEqual({
      kind: 'write',
      path: '/src/index.ts',
      content: 'hello',
      output: 'File written',
    })
  })

  it('classifies Edit as a write using newString', () => {
    const event: RawSessionEvent = {
      kind: 'action',
      tool: 'Edit',
      input: {
        filePath: '/src/index.ts',
        oldString: 'old',
        newString: 'new',
      },
      output: 'Edit applied',
      toolUseId: 'call_3',
    }
    expect(toCanonical(event)).toEqual({
      kind: 'write',
      path: '/src/index.ts',
      content: 'new',
      output: 'Edit applied',
    })
  })

  it('classifies unknown tools as other', () => {
    const event: RawSessionEvent = {
      kind: 'action',
      tool: 'Grep',
      input: { pattern: 'foo' },
      output: 'found',
      toolUseId: 'call_4',
    }
    expect(toCanonical(event)).toEqual({
      kind: 'other',
      tool: 'Grep',
      input: { pattern: 'foo' },
      output: 'found',
    })
  })
})
