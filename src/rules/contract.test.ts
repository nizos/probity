import { describe, it, expect } from 'vitest'

import { isRuleResult } from './contract.js'

describe('isRuleResult', () => {
  it('rejects a result whose kind is outside the pass/violation contract', () => {
    expect(isRuleResult({ kind: 'skip' })).toBe(false)
  })

  it('rejects a violation that omits its reason string', () => {
    expect(isRuleResult({ kind: 'violation' })).toBe(false)
  })

  it('accepts a pass carrying operator notes (trace-only fields are not validated)', () => {
    expect(isRuleResult({ kind: 'pass', notes: [{ kind: 'fast-path' }] })).toBe(
      true,
    )
  })
})
