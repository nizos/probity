import { expect } from 'vitest'

import { isVendorAuthFailure } from './auth-patterns.js'

export function expectDecision(
  result: { decision: string; reason?: string },
  expected: string,
): void {
  if (isVendorAuthFailure(result.reason)) {
    throw new Error(`vendor authentication failed: ${result.reason}`)
  }
  if (result.decision !== expected) {
    console.error(
      `\nTest failed — expected decision: ${expected}, but got: ${result.decision}`,
    )
    console.error(`${result.reason ?? '(no reason)'}\n`)
  }
  expect(result.decision).toBe(expected)
}
