// Test-file shapes and implementation shapes used by every
// enforce-tdd integration test. The three vendor suites
// (claude-code, codex, github-copilot) all assert the same property —
// "enforceTdd allows/denies a minimal/over-impl write" — so the
// fixture content is shared; what varies per file is the vendor
// payload shape and response decoding.

export const EXISTING_TEST_CONTENT = `import { describe, expect, it } from 'vitest'
import { add } from './calculator.js'

describe('calculator', () => {
  it('adds two numbers', () => {
    expect(add(2, 3)).toBe(5)
  })
})
`

export const PLUS_ONE_TEST = `import { describe, expect, it } from 'vitest'
import { add } from './calculator.js'

describe('calculator', () => {
  it('adds two numbers', () => {
    expect(add(2, 3)).toBe(5)
  })

  it('adds negative numbers', () => {
    expect(add(-1, -1)).toBe(-2)
  })
})
`

export const PLUS_TWO_TESTS = `import { describe, expect, it } from 'vitest'
import { add } from './calculator.js'

describe('calculator', () => {
  it('adds two numbers', () => {
    expect(add(2, 3)).toBe(5)
  })

  it('adds negative numbers', () => {
    expect(add(-1, -1)).toBe(-2)
  })

  it('adds zeros', () => {
    expect(add(0, 0)).toBe(0)
  })
})
`

export const MINIMAL_IMPL = `export function add(a: number, b: number): number {
  return a + b
}
`

export const OVER_IMPL = `export function add(a: number, b: number): number {
  return a + b
}
export function subtract(a: number, b: number): number {
  return a - b
}
export function multiply(a: number, b: number): number {
  return a * b
}
export function divide(a: number, b: number): number {
  if (b === 0) throw new Error('division by zero')
  return a / b
}
export function power(a: number, b: number): number {
  return Math.pow(a, b)
}
export function sqrt(a: number): number {
  return Math.sqrt(a)
}
`

export const MODULO_STUB_IMPL = `export function modulo(a: number, b: number): number {
  return 0
}
`

/**
 * Pending state for the first write of a multi-step change: identical
 * to {@link MINIMAL_IMPL} plus a new import that no callsite uses
 * yet. The unused import is a transient structural state; a follow-up
 * write will introduce the call.
 */
export const MINIMAL_IMPL_PLUS_UNUSED_IMPORT = `import { multiply } from './helpers.js'

export function add(a: number, b: number): number {
  return a + b
}
`

/**
 * "Looks like a test file" heuristic. Used by setups to place the
 * pending write under target.test.ts vs target.ts so the rule's
 * "is this a test or impl?" classifier sees the expected name.
 */
export function targetFilename(content: string): string {
  return /describe\(|\bit\(/.test(content) ? 'target.test.ts' : 'target.ts'
}
