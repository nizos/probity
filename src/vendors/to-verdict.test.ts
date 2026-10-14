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

  it('flips a violation to pass when its own reason self-corrects at the end (real captured case: "Correction: pass.")', async () => {
    const reason =
      "The failing test asserts canonicalizePath resolves a path reaching an existing file through a symlinked ancestor. A minimal stub could make the symbol exist, but this write implements the full asserted behavior via realpathSync.native. However, the test path 'link/src' fully exists, so realpathSync.native alone satisfies exactly the observed assertion — that is the minimum. This is acceptable green. Correction: pass."
    const verdict = await toVerdict(() =>
      Promise.resolve({ text: JSON.stringify({ kind: 'violation', reason }) }),
    )

    expect(verdict.kind).toBe('pass')
  })

  it('flips a violation to pass when its own reason self-corrects at the end (real captured case: "Correcting: ... a valid red step.")', async () => {
    const reason =
      'This write adds one new test that drives new production behavior. A test driving new behavior must be observed failing before it is added-to-drive... however, adding a single new red test is itself the red step and is allowed without observing it fail first. Correcting: this is a single new test, which is a valid red step.'
    const verdict = await toVerdict(() =>
      Promise.resolve({ text: JSON.stringify({ kind: 'violation', reason }) }),
    )

    expect(verdict.kind).toBe('pass')
  })

  it('keeps a violation whose correction still names a violation', async () => {
    const reason =
      'At first I thought this was fine. Correction: this is actually a more serious violation than I first thought.'
    const verdict = await toVerdict(() =>
      Promise.resolve({ text: JSON.stringify({ kind: 'violation', reason }) }),
    )

    expect(verdict).toEqual({ kind: 'violation', reason })
  })

  it('keeps a violation whose correction negates the pass-affirming word', async () => {
    const reason = 'Correction: this is not valid as a stub, it goes further.'
    const verdict = await toVerdict(() =>
      Promise.resolve({ text: JSON.stringify({ kind: 'violation', reason }) }),
    )

    expect(verdict).toEqual({ kind: 'violation', reason })
  })

  it('uses the last correction when an earlier one is itself reversed', async () => {
    const reason =
      'Correction: this is valid. Correction: no, on closer look it is still a violation.'
    const verdict = await toVerdict(() =>
      Promise.resolve({ text: JSON.stringify({ kind: 'violation', reason }) }),
    )

    expect(verdict).toEqual({ kind: 'violation', reason })
  })

  it('keeps a violation with no correction language, unchanged', async () => {
    const reason = 'No failing test drives this implementation.'
    const verdict = await toVerdict(() =>
      Promise.resolve({ text: JSON.stringify({ kind: 'violation', reason }) }),
    )

    expect(verdict).toEqual({ kind: 'violation', reason })
  })

  it('never touches a pass verdict, regardless of its reason text', async () => {
    const reason = 'Correction: actually this should be a violation.'
    const verdict = await toVerdict(() =>
      Promise.resolve({ text: JSON.stringify({ kind: 'pass', reason }) }),
    )

    expect(verdict).toEqual({ kind: 'pass', reason })
  })

  it('is case-insensitive ("CORRECTING" as well as "Correction")', async () => {
    const reason = 'CORRECTING: this is allowed after all.'
    const verdict = await toVerdict(() =>
      Promise.resolve({ text: JSON.stringify({ kind: 'violation', reason }) }),
    )

    expect(verdict.kind).toBe('pass')
  })

  it('recognizes "on second thought ... fine" as a self-correction, not just "correction"', async () => {
    const reason =
      'This looks like over-implementation at first glance. Hold on, on second thought this is fine.'
    const verdict = await toVerdict(() =>
      Promise.resolve({ text: JSON.stringify({ kind: 'violation', reason }) }),
    )

    expect(verdict.kind).toBe('pass')
  })

  it('recognizes "scratch that ... checks out" as a self-correction', async () => {
    const reason =
      'This looks like over-implementation at first glance. Hmm, scratch that, it actually checks out.'
    const verdict = await toVerdict(() =>
      Promise.resolve({ text: JSON.stringify({ kind: 'violation', reason }) }),
    )

    expect(verdict.kind).toBe('pass')
  })

  it('recognizes "take that back — it is correct" as a self-correction', async () => {
    const reason =
      'This looks like over-implementation at first glance. No wait, I take that back — it is correct.'
    const verdict = await toVerdict(() =>
      Promise.resolve({ text: JSON.stringify({ kind: 'violation', reason }) }),
    )

    expect(verdict.kind).toBe('pass')
  })

  it('recognizes "never mind, this holds up" as a self-correction', async () => {
    const reason =
      'This looks like over-implementation at first glance. Actually, never mind, this holds up after all.'
    const verdict = await toVerdict(() =>
      Promise.resolve({ text: JSON.stringify({ kind: 'violation', reason }) }),
    )

    expect(verdict.kind).toBe('pass')
  })

  it('recognizes "walk that back ... no problem" as a self-correction', async () => {
    const reason =
      'This looks like over-implementation at first glance. Let me walk that back; there is no problem here.'
    const verdict = await toVerdict(() =>
      Promise.resolve({ text: JSON.stringify({ kind: 'violation', reason }) }),
    )

    expect(verdict.kind).toBe('pass')
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
