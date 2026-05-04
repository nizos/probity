import { describe, it, expect } from 'vitest'

import type { RawSessionEvent } from '../types.js'
import { trimHistory } from './trim-history.js'

describe('trimHistory', () => {
  it('truncates long action.output with head + marker + tail', () => {
    const longOutput = 'A'.repeat(1500)
    const events: RawSessionEvent[] = [
      {
        kind: 'action',
        tool: 'Bash',
        input: { command: 'x' },
        output: longOutput,
        toolUseId: 'tu_1',
      },
    ]

    const [windowed] = trimHistory(events, {
      maxEvents: 10,
      maxContentChars: 1000,
    })

    if (windowed?.kind !== 'action') throw new Error('expected action')
    expect(windowed.output).toMatch(
      /^A{500}\n\[500 more characters truncated\]\nA{500}$/,
    )
  })

  it('truncates long prompt.text the same way', () => {
    const longText = 'B'.repeat(1500)
    const events: RawSessionEvent[] = [{ kind: 'prompt', text: longText }]

    const [windowed] = trimHistory(events, {
      maxEvents: 10,
      maxContentChars: 1000,
    })

    if (windowed?.kind !== 'prompt') throw new Error('expected prompt')
    expect(windowed.text).toMatch(
      /^B{500}\n\[500 more characters truncated\]\nB{500}$/,
    )
  })

  it('keeps only the last N events when count exceeds maxEvents', () => {
    const events: RawSessionEvent[] = [
      { kind: 'prompt', text: 'a' },
      { kind: 'prompt', text: 'b' },
      { kind: 'prompt', text: 'c' },
      { kind: 'prompt', text: 'd' },
    ]

    const windowed = trimHistory(events, {
      maxEvents: 2,
      maxContentChars: 1000,
    })

    expect(windowed).toEqual([
      { kind: 'prompt', text: 'c' },
      { kind: 'prompt', text: 'd' },
    ])
  })
})
