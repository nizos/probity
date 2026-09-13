import { describe, it, expect } from 'vitest'

import { createAgentCallCollector } from './agent-call-collector.js'
import type { Agent, TraceEntry, Verdict } from './types.js'

describe('createAgentCallCollector', () => {
  it('passes the inner agent verdict back to callers', async () => {
    const { collector, verdict } = setup({
      verdict: { kind: 'pass', reason: 'looks fine' },
    })

    const returned = await collector.agent.reason('hi')

    expect(returned).toEqual(verdict)
  })

  it('folds a call captured during a rule onto that rule-evaluated entry', async () => {
    const { collector, verdict } = setup()

    collector.hooks.onRuleStart?.('enforceTdd')
    await collector.agent.reason('hi')
    collector.hooks.onRuleEnd?.('enforceTdd')

    const enriched = collector.enrichTrace([ruleEvaluated('enforceTdd')])
    const first = enriched[0]
    if (first?.kind !== 'rule-evaluated') {
      expect.fail(`expected rule-evaluated; got ${first?.kind ?? 'no entry'}`)
    }
    expect(first.agentCalls).toHaveLength(1)
    const call = first.agentCalls?.[0]
    expect(call?.verdict).toEqual(verdict)
    expect(call?.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('drops calls that happen outside any rule lifecycle', async () => {
    const { collector } = setup()

    await collector.agent.reason('hi')

    const enriched = collector.enrichTrace([ruleEvaluated('enforceTdd')])
    const first = enriched[0]
    if (first?.kind !== 'rule-evaluated') {
      expect.fail(`expected rule-evaluated; got ${first?.kind ?? 'no entry'}`)
    }
    expect(first.agentCalls).toEqual([])
  })

  it('passes through non-rule-evaluated trace entries unchanged', () => {
    const { collector } = setup()
    const trace: readonly TraceEntry[] = [
      { kind: 'parse-failed', reason: 'bad json' },
      { kind: 'rule-failed', rule: 'x', reason: 'boom', durationMs: 1 },
    ]

    expect(collector.enrichTrace(trace)).toEqual(trace)
  })

  it('preserves and records the optional system-aware agent capability', async () => {
    const verdict: Verdict = { kind: 'pass', reason: 'system-aware' }
    const received: { system: string; prompt: string }[] = []
    const collector = createAgentCallCollector({
      reason: () => Promise.resolve(verdict),
      reasonWithSystem: (input) => {
        received.push(input)
        return Promise.resolve(verdict)
      },
    })

    collector.hooks.onRuleStart?.('enforceTdd')
    const returned = await collector.agent.reasonWithSystem?.({
      system: 'stable',
      prompt: 'dynamic',
    })
    collector.hooks.onRuleEnd?.('enforceTdd')

    expect(received).toEqual([{ system: 'stable', prompt: 'dynamic' }])
    expect(returned).toEqual(verdict)
    const [entry] = collector.enrichTrace([ruleEvaluated('enforceTdd')])
    expect(entry?.kind === 'rule-evaluated' && entry.agentCalls).toHaveLength(1)
  })

  it('does not invent a system-aware capability for a reason-only agent', () => {
    const { collector } = setup()

    expect(collector.agent.reasonWithSystem).toBeUndefined()
  })

  it('preserves the receiver for system-aware agent methods', async () => {
    const inner = {
      prefix: 'bound',
      reason: () => Promise.resolve({ kind: 'pass' as const, reason: '' }),
      reasonWithSystem() {
        return Promise.resolve({
          kind: 'pass' as const,
          reason: this.prefix,
        })
      },
    }
    const collector = createAgentCallCollector(inner)

    const verdict = await collector.agent.reasonWithSystem?.({
      system: 'stable',
      prompt: 'dynamic',
    })

    expect(verdict?.reason).toBe('bound')
  })
})

function setup(options: { verdict?: Verdict } = {}) {
  const verdict: Verdict = options.verdict ?? { kind: 'pass', reason: '' }
  const inner: Agent = { reason: () => Promise.resolve(verdict) }
  const collector = createAgentCallCollector(inner)
  return { collector, verdict }
}

function ruleEvaluated(rule: string): TraceEntry {
  return {
    kind: 'rule-evaluated',
    rule,
    result: { kind: 'pass' },
    durationMs: 0,
  }
}
