import { describe, it, expect } from 'vitest'

import { evaluate } from './engine.js'
import type { Rule } from './rules/contract.js'
import type { RuleResult } from './types.js'

describe('engine', () => {
  it('records a rule-evaluated entry for each rule that ran, including the violator', async () => {
    const pass: Rule = () => ({ kind: 'pass' as const })
    const violate: Rule = () => ({
      kind: 'violation' as const,
      reason: 'no',
    })
    const unreached: Rule = () => ({ kind: 'pass' as const })

    const outcome = await evaluate({ kind: 'command', command: 'x' }, [
      pass,
      violate,
      unreached,
    ])

    expect(outcome.trace).toHaveLength(2)
    expect(outcome.trace[0]).toMatchObject({
      kind: 'rule-evaluated',
      rule: 'pass',
      result: { kind: 'pass' },
    })
    expect(outcome.trace[1]).toMatchObject({
      kind: 'rule-evaluated',
      rule: 'violate',
      result: { kind: 'violation', reason: 'no' },
    })
  })

  it('returns allow when every rule passes', async () => {
    const alwaysPass: Rule = () => ({ kind: 'pass' as const })

    const { decision } = await evaluate({ kind: 'command', command: 'x' }, [
      alwaysPass,
    ])

    expect(decision).toEqual({ kind: 'allow' })
  })

  it('returns block with the violation reason when a rule objects', async () => {
    const alwaysViolate: Rule = () => ({
      kind: 'violation' as const,
      reason: 'nope',
    })

    const { decision } = await evaluate({ kind: 'command', command: 'x' }, [
      alwaysViolate,
    ])

    expect(decision).toEqual({ kind: 'block', reason: 'nope' })
  })

  it('awaits async rules and returns an allow decision when they pass', async () => {
    const asyncPass: Rule = () => Promise.resolve({ kind: 'pass' as const })

    const { decision } = await evaluate({ kind: 'command', command: 'x' }, [
      asyncPass,
    ])

    expect(decision).toEqual({ kind: 'allow' })
  })

  it('passes the context to rules that accept it', async () => {
    let received: unknown = undefined
    const capturing: Rule = (_action, ctx) => {
      received = ctx
      return { kind: 'pass' as const }
    }
    const ctx = {}

    await evaluate({ kind: 'command', command: 'x' }, [capturing], ctx)

    expect(received).toBe(ctx)
  })

  it('applies the rules in a rule block', async () => {
    const violate: Rule = () => ({ kind: 'violation' as const, reason: 'no' })

    const { decision } = await evaluate({ kind: 'command', command: 'x' }, [
      { rules: [violate] },
    ])

    expect(decision).toEqual({ kind: 'block', reason: 'no' })
  })

  it('skips a rule block when the write path does not match files', async () => {
    const violate: Rule = () => ({ kind: 'violation' as const, reason: 'no' })

    const { decision } = await evaluate(
      { kind: 'write', path: 'README.md', content: '' },
      [{ files: ['src/**'], rules: [violate] }],
    )

    expect(decision).toEqual({ kind: 'allow' })
  })

  it('applies a rule block with files to a command action (files only filters writes)', async () => {
    const violate: Rule = () => ({ kind: 'violation' as const, reason: 'no' })

    const { decision } = await evaluate(
      { kind: 'command', command: 'rm -rf /' },
      [{ files: ['src/**'], rules: [violate] }],
    )

    expect(decision).toEqual({ kind: 'block', reason: 'no' })
  })

  it('processes multiple rule blocks in order, skipping non-matches and short-circuiting on the first violation', async () => {
    const fail: Rule = () => ({
      kind: 'violation' as const,
      reason: 'second block fired',
    })
    const unreached: Rule = () => {
      throw new Error('block should never run')
    }

    const { decision } = await evaluate(
      { kind: 'write', path: 'src/foo.ts', content: '' },
      [
        { files: ['lib/**'], rules: [unreached] },
        { files: ['src/**'], rules: [fail] },
        { files: ['**/*.md'], rules: [unreached] },
      ],
    )

    expect(decision).toEqual({ kind: 'block', reason: 'second block fired' })
  })

  it('runtime-defends against an empty files array on command actions', async () => {
    const violate: Rule = () => ({ kind: 'violation' as const, reason: 'no' })

    const { decision } = await evaluate(
      { kind: 'command', command: 'rm -rf /' },
      [{ files: [] as unknown as readonly [string], rules: [violate] }],
    )

    expect(decision).toEqual({ kind: 'allow' })
  })

  it('turns a rule crash into a block decision (fail-closed)', async () => {
    const crashing: Rule = () => {
      throw new Error('kaboom')
    }

    const { decision } = await evaluate({ kind: 'command', command: 'x' }, [
      crashing,
    ])

    expect(decision).toEqual({
      kind: 'block',
      reason: 'rule error: kaboom',
    })
  })

  it('turns an off-contract rule result into a fail-closed block, recording a rule-failed entry', async () => {
    const offContract: Rule = () => ({ kind: 'skip' }) as unknown as RuleResult

    const { decision, trace } = await evaluate(
      { kind: 'command', command: 'x' },
      [offContract],
    )

    expect(decision.kind).toBe('block')
    expect(trace[0]).toMatchObject({
      kind: 'rule-failed',
      rule: 'offContract',
      reason: 'returned a result outside the pass/violation contract',
    })
  })

  it('records a rule-failed entry attributing a throwing rule, with the error as the reason', async () => {
    const crashing: Rule = () => {
      throw new Error('kaboom')
    }

    const outcome = await evaluate({ kind: 'command', command: 'x' }, [
      crashing,
    ])

    expect(outcome.trace[0]).toMatchObject({
      kind: 'rule-failed',
      rule: 'crashing',
      reason: 'kaboom',
    })
  })

  it('records the durationMs of each rule-failed entry as a non-negative number', async () => {
    const crashing: Rule = () => {
      throw new Error('kaboom')
    }

    const outcome = await evaluate({ kind: 'command', command: 'x' }, [
      crashing,
    ])
    const first = outcome.trace[0]

    if (first?.kind !== 'rule-failed') {
      expect.fail(`expected rule-failed; got ${first?.kind ?? 'no entry'}`)
    }
    expect(first.durationMs).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(first.durationMs)).toBe(true)
  })

  it('records the durationMs of each rule-evaluated entry as a non-negative number', async () => {
    const pass: Rule = () => ({ kind: 'pass' as const })

    const outcome = await evaluate({ kind: 'command', command: 'x' }, [pass])
    const first = outcome.trace[0]

    if (first?.kind !== 'rule-evaluated') {
      expect.fail(`expected rule-evaluated; got ${first?.kind ?? 'no entry'}`)
    }
    expect(first.durationMs).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(first.durationMs)).toBe(true)
  })

  it('attributes a rule with no inferable name as "(unnamed)" in the trace', async () => {
    const outcome = await evaluate({ kind: 'command', command: 'x' }, [
      () => ({ kind: 'pass' as const }),
    ])

    expect(outcome.trace[0]).toMatchObject({
      kind: 'rule-evaluated',
      rule: '(unnamed)',
    })
  })

  it('emits onRuleStart and onRuleEnd around each rule run, in order', async () => {
    const pass: Rule = () => ({ kind: 'pass' as const })
    const violate: Rule = () => ({ kind: 'violation' as const, reason: 'no' })
    const events: string[] = []

    await evaluate(
      { kind: 'command', command: 'x' },
      [pass, violate],
      undefined,
      {
        onRuleStart: (name) => events.push(`start ${name}`),
        onRuleEnd: (name) => events.push(`end ${name}`),
      },
    )

    expect(events).toEqual([
      'start pass',
      'end pass',
      'start violate',
      'end violate',
    ])
  })
})
