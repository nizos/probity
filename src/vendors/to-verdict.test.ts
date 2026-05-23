import { describe, it, expect } from 'vitest'

import { toVerdict } from './to-verdict.js'

describe('toVerdict', () => {
  it('parses a plain JSON verdict from the text source response', async () => {
    const verdict = await toVerdict(() =>
      Promise.resolve({ text: '{"kind":"pass","reason":"ok"}' }),
    )

    expect(verdict).toEqual({ kind: 'pass', reason: 'ok' })
  })

  it('returns a fail-closed violation when the text is not valid JSON', async () => {
    const verdict = await toVerdict(() =>
      Promise.resolve({ text: 'not json at all' }),
    )

    expect(verdict.kind).toBe('violation')
    expect(verdict.reason).toMatch(/parse|invalid|json/i)
  })

  it('returns a fail-closed violation when the verdict field is unexpected', async () => {
    const verdict = await toVerdict(() =>
      Promise.resolve({ text: '{"kind":"maybe","reason":"unsure"}' }),
    )

    expect(verdict.kind).toBe('violation')
    expect(verdict.reason).toMatch(/unexpected|invalid|shape|verdict/i)
  })

  it('parses a verdict wrapped in a JSON code fence', async () => {
    const fenced = '```json\n{"kind":"pass","reason":"fine"}\n```'
    const verdict = await toVerdict(() => Promise.resolve({ text: fenced }))

    expect(verdict).toEqual({ kind: 'pass', reason: 'fine' })
  })

  it('includes the zod issue path and message in the violation reason for shape mismatches', async () => {
    const verdict = await toVerdict(() =>
      Promise.resolve({ text: '{"kind":"pass","reason":42}' }),
    )

    expect(verdict.kind).toBe('violation')
    expect(verdict.reason).toContain('reason')
    expect(verdict.reason).toMatch(/string/i)
  })

  it('returns a fail-closed violation when the text source throws', async () => {
    const verdict = await toVerdict(() =>
      Promise.reject(new Error('SDK transport failure')),
    )

    expect(verdict.kind).toBe('violation')
    expect(verdict.reason).toMatch(/SDK transport failure/)
  })

  it('preserves a useful slice of the validator output in the parse-failure reason (not just the first 200 chars)', async () => {
    const longProse = 'x'.repeat(2000)
    const verdict = await toVerdict(() => Promise.resolve({ text: longProse }))

    expect(verdict.kind).toBe('violation')
    expect(verdict.reason).toContain(longProse)
  })

  it('extracts a verdict object embedded after prose preamble (models often "show their work" before the JSON)', async () => {
    const proseThenJson =
      'Looking at this carefully:\n\n## Analysis\n\nThe pending action is fine.\n\n' +
      '{"kind":"pass","reason":"shape change driven by failing test"}'

    const verdict = await toVerdict(() =>
      Promise.resolve({ text: proseThenJson }),
    )

    expect(verdict).toEqual({
      kind: 'pass',
      reason: 'shape change driven by failing test',
    })
  })

  it('forwards AgentMeta from the response source onto the parsed verdict', async () => {
    const verdict = await toVerdict(() =>
      Promise.resolve({
        text: '{"kind":"pass","reason":"ok"}',
        meta: { model: 'test-model', inputTokens: 100, outputTokens: 20 },
      }),
    )

    expect(verdict).toEqual({
      kind: 'pass',
      reason: 'ok',
      meta: { model: 'test-model', inputTokens: 100, outputTokens: 20 },
    })
  })
})
