import { describe, expect, it, onTestFinished, type TestContext } from 'vitest'

import type { Agent } from '../../src/types.js'
import { preflightAuth, skipIfUnauthed } from './preflight-auth.js'

describe('preflightAuth', () => {
  it('skips with a reason when PROBITY_INTEGRATION_AI is not set', async () => {
    withEnv('PROBITY_INTEGRATION_AI', undefined)

    const result = await preflightAuth(neverCalledAgent())

    expect(result).toEqual({
      ok: false,
      reason: 'PROBITY_INTEGRATION_AI is not set',
    })
  })

  it('returns ok when the agent responds without an auth-failure verdict', async () => {
    withEnv('PROBITY_INTEGRATION_AI', '1')

    const result = await preflightAuth(
      passAgent({ kind: 'pass', reason: 'probe' }),
    )

    expect(result).toEqual({ ok: true })
  })

  it.each([
    {
      vendor: 'claude-code',
      reason:
        'could not parse verdict from validator output: Not logged in · Please run /login',
    },
    {
      vendor: 'codex',
      reason:
        'unexpected status 401 Unauthorized: Missing bearer or basic authentication in header, url: https://api.openai.com/v1/responses',
    },
    {
      vendor: 'copilot',
      reason:
        'Execution failed: Error: Session was not created with authentication info or custom provider',
    },
  ])(
    'skips with the verdict reason when the agent surfaces a $vendor auth failure',
    async ({ reason }) => {
      withEnv('PROBITY_INTEGRATION_AI', '1')

      const result = await preflightAuth(
        passAgent({ kind: 'violation', reason }),
      )

      expect(result).toEqual({ ok: false, reason })
    },
  )
})

describe('skipIfUnauthed', () => {
  it('calls skip with the preflight reason when not ok', () => {
    const recorder = recordSkipCalls()

    skipIfUnauthed({ ok: false, reason: 'not authenticated' }, recorder.skip)

    expect(recorder.calls).toEqual([
      { condition: true, note: 'not authenticated' },
    ])
  })

  it('does not call skip when preflight is ok', () => {
    const recorder = recordSkipCalls()

    skipIfUnauthed({ ok: true }, recorder.skip)

    expect(recorder.calls).toEqual([])
  })
})

function withEnv(name: string, value: string | undefined): void {
  const previous = process.env[name]
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
  onTestFinished(() => {
    if (previous === undefined) delete process.env[name]
    else process.env[name] = previous
  })
}

function neverCalledAgent(): Agent {
  return {
    reason: () =>
      Promise.reject(new Error('agent.reason should not be called')),
  }
}

function passAgent(
  verdict:
    { kind: 'pass'; reason: string } | { kind: 'violation'; reason: string },
): Agent {
  return { reason: () => Promise.resolve(verdict) }
}

type SkipCall = {
  condition?: boolean | undefined
  note?: string | undefined
}

function recordSkipCalls(): { skip: TestContext['skip']; calls: SkipCall[] } {
  const calls: SkipCall[] = []
  const skip = ((conditionOrNote?: boolean | string, note?: string): void => {
    if (typeof conditionOrNote === 'boolean') {
      calls.push({ condition: conditionOrNote, note })
    } else {
      calls.push({ note: conditionOrNote })
    }
  }) as TestContext['skip']
  return { skip, calls }
}
