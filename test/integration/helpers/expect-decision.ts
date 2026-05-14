import { expect } from 'vitest'

export function expectDecision(
  result: { decision: string; reason?: string },
  expected: string,
): void {
  if (result.decision !== expected) {
    console.error(
      `\nTest failed — expected decision: ${expected}, but got: ${result.decision}`,
    )
    console.error(`Reason: ${result.reason ?? '(no reason)'}\n`)
  }
  expect(result.decision).toBe(expected)
}
