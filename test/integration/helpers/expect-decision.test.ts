import { describe, expect, it, onTestFinished, vi } from 'vitest'

import { expectDecision } from './expect-decision.js'

describe('expectDecision', () => {
  it.each([
    {
      name: 'a normal rule-violation reason',
      reason: 'Probity: test was not run before implementation',
    },
    {
      name: 'an AI verdict mentioning 401 in a non-auth context',
      reason:
        'over-implementation: the 401-handling test has not been written yet',
    },
  ])('authorized: runs the decision assertion for $name', ({ reason }) => {
    silenceConsoleError()
    expect(() =>
      expectDecision({ decision: 'block', reason }, 'allow'),
    ).toThrow(/expected 'block' to be 'allow'/)
  })

  it.each([
    {
      name: 'codex 401 SDK error',
      reason:
        'Probity: unexpected status 401 Unauthorized: Missing bearer or basic authentication in header, url: https://api.openai.com/v1/responses',
    },
    {
      name: 'copilot uninitialised-session SDK error',
      reason:
        'Probity: Execution failed: Error: Session was not created with authentication info or custom provider',
    },
    {
      name: 'claude-code logged-out CLI error',
      reason:
        'Probity: could not parse verdict from validator output: Not logged in · Please run /login',
    },
  ])('unauthorized: throws an auth-labelled error for $name', ({ reason }) => {
    expect(() =>
      expectDecision({ decision: 'block', reason }, 'allow'),
    ).toThrow(/authentication/i)
  })
})

function silenceConsoleError(): void {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  onTestFinished(() => {
    vi.restoreAllMocks()
  })
}
