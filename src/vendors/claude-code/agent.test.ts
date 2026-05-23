import type { Options as ClaudeQueryOptions } from '@anthropic-ai/claude-agent-sdk'
import { describe, it, expect } from 'vitest'

import { claudeCode } from './agent.js'

describe('claudeCode', () => {
  it('returns the verdict parsed from the final result message', async () => {
    const client = claudeCode({
      queryFn: fakeQuery({ result: '{"kind":"violation","reason":"no test"}' }),
    })

    const verdict = await client.reason('some prompt')

    expect(verdict).toEqual({ kind: 'violation', reason: 'no test' })
  })

  it('parses a distinct verdict from a different query result', async () => {
    const client = claudeCode({
      queryFn: fakeQuery({ result: '{"kind":"pass","reason":"looks fine"}' }),
    })

    const verdict = await client.reason('some prompt')

    expect(verdict).toEqual({ kind: 'pass', reason: 'looks fine' })
  })

  it('limits the query to a single turn', async () => {
    const capture = captureQuery()
    const client = claudeCode({ queryFn: capture.fn })

    await client.reason('prompt')

    expect(capture.last?.options?.maxTurns).toBe(1)
  })

  it('disallows tool use so the validator cannot act', async () => {
    const capture = captureQuery()
    const client = claudeCode({ queryFn: capture.fn })

    await client.reason('prompt')

    expect(capture.last?.options?.disallowedTools).toEqual(
      expect.arrayContaining(['Bash', 'Write', 'Edit']),
    )
  })

  it('disables extended thinking for fast turnaround', async () => {
    const capture = captureQuery()
    const client = claudeCode({ queryFn: capture.fn })

    await client.reason('prompt')

    expect(capture.last?.options?.thinking).toEqual({ type: 'disabled' })
  })

  it('hard-denies any tool use via dontAsk + empty allowedTools', async () => {
    const capture = captureQuery()
    const client = claudeCode({ queryFn: capture.fn })

    await client.reason('prompt')

    expect(capture.last?.options?.permissionMode).toBe('dontAsk')
    expect(capture.last?.options?.allowedTools).toEqual([])
  })

  it('does not inherit host project or user settings', async () => {
    const capture = captureQuery()
    const client = claudeCode({ queryFn: capture.fn })

    await client.reason('prompt')

    expect(capture.last?.options?.settingSources).toEqual([])
  })

  it('does not persist sessions to disk so validator runs do not pollute project history', async () => {
    const capture = captureQuery()
    const client = claudeCode({ queryFn: capture.fn })

    await client.reason('prompt')

    expect(capture.last?.options?.persistSession).toBe(false)
  })

  it('parses a verdict from a fenced code block', async () => {
    const client = claudeCode({
      queryFn: fakeQuery({
        result: '```json\n{"kind":"pass","reason":"fine"}\n```',
      }),
    })

    const verdict = await client.reason('prompt')

    expect(verdict).toEqual({ kind: 'pass', reason: 'fine' })
  })

  it('returns a fail-closed violation when the response is not valid JSON', async () => {
    const client = claudeCode({
      queryFn: fakeQuery({ result: 'not valid json at all' }),
    })

    const verdict = await client.reason('prompt')

    expect(verdict.kind).toBe('violation')
    expect(verdict.reason).toMatch(/parse|invalid|json/i)
  })

  it('returns a fail-closed violation when verdict is not pass or violation', async () => {
    const client = claudeCode({
      queryFn: fakeQuery({ result: '{"kind":"maybe","reason":"unsure"}' }),
    })

    const verdict = await client.reason('prompt')

    expect(verdict.kind).toBe('violation')
    expect(verdict.reason).toMatch(/unexpected|invalid|shape|verdict/i)
  })

  it('fails closed when the result message has a non-string result', async () => {
    const client = claudeCode({
      queryFn: fakeQuery({ result: { oops: 'this should be a string' } }),
    })

    const verdict = await client.reason('prompt')

    expect(verdict.kind).toBe('violation')
    expect(verdict.reason).toMatch(/result|string|shape/i)
  })

  it('does not pass an env option (SDK handles session context)', async () => {
    const capture = captureQuery()
    const client = claudeCode({ queryFn: capture.fn })

    await client.reason('prompt')

    expect(capture.last?.options?.env).toBeUndefined()
  })

  it('attaches model and token meta from the SDK result message to the verdict', async () => {
    const client = claudeCode({
      queryFn: fakeQuery({
        result: '{"kind":"pass","reason":"ok"}',
        usage: { input_tokens: 1024, output_tokens: 64 },
        model: 'claude-opus-4-7',
        duration_ms: 850,
      }),
    })

    const verdict = await client.reason('prompt')

    expect(verdict.meta).toEqual({
      model: 'claude-opus-4-7',
      inputTokens: 1024,
      outputTokens: 64,
    })
  })
})

type CapturedArgs = {
  prompt: string
  options?: ClaudeQueryOptions
}

function captureQuery() {
  const state: { last?: CapturedArgs } = {}
  const fn = (args: CapturedArgs) => {
    state.last = args
    return asyncStream([
      {
        type: 'result' as const,
        subtype: 'success' as const,
        result: '{"kind":"pass","reason":""}',
      },
    ])
  }
  return {
    fn,
    get last() {
      return state.last
    },
  }
}

function fakeQuery(
  opts: {
    result?: unknown
    usage?: { input_tokens?: number; output_tokens?: number }
    model?: string
    duration_ms?: number
  } = {},
) {
  return () =>
    asyncStream([
      {
        type: 'result' as const,
        subtype: 'success' as const,
        result: opts.result ?? '{"kind":"pass","reason":""}',
        ...(opts.usage && { usage: opts.usage }),
        ...(opts.model !== undefined && { model: opts.model }),
        ...(opts.duration_ms !== undefined && {
          duration_ms: opts.duration_ms,
        }),
      },
    ])
}

function asyncStream<T>(items: readonly T[]): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]: () => {
      const iter = items[Symbol.iterator]()
      return { next: () => Promise.resolve(iter.next()) }
    },
  }
}
