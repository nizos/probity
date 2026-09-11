import { describe, expect, it } from 'vitest'

import { StringOrTextBlocks } from './string-or-text-blocks.js'

describe('StringOrTextBlocks', () => {
  it('preserves a string unchanged', () => {
    expect(StringOrTextBlocks.parse('test output')).toBe('test output')
  })

  it('joins text blocks in order', () => {
    expect(
      StringOrTextBlocks.parse([
        { type: 'input_text', text: 'first' },
        { type: 'input_text', text: 'second' },
      ]),
    ).toBe('first\nsecond')
  })

  it('ignores non-text and malformed blocks', () => {
    expect(
      StringOrTextBlocks.parse([
        { type: 'input_text', text: 'visible' },
        { type: 'image', source: '...' },
        null,
        { type: 'input_text', text: 42 },
      ]),
    ).toBe('visible')
  })

  it('rejects unsupported top-level values', () => {
    expect(StringOrTextBlocks.safeParse(42).success).toBe(false)
  })
})
