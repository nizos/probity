import type { Agent, AgentCall, TraceEntry } from './types.js'
import type { EvaluateHooks } from './engine.js'

/**
 * Captures AI validator calls for the operator trace. Rules stay clean:
 * they call `ctx.agent.reason(prompt)`; attribution flows through this
 * collector without rule cooperation. Calls made outside any rule's
 * lifecycle are silently dropped.
 */
export type AgentCallCollector = {
  agent: Agent
  hooks: EvaluateHooks
  enrichTrace: (trace: readonly TraceEntry[]) => readonly TraceEntry[]
}

export function createAgentCallCollector(agent: Agent): AgentCallCollector {
  const log = createAgentCallLog()
  const tracker = createRuleTracker()
  return {
    agent: withCallTiming(agent, (call) => {
      const rule = tracker.current()
      if (rule !== undefined) log.record(rule, call)
    }),
    hooks: tracker.hooks,
    enrichTrace: (trace) => foldAgentCalls(trace, log),
  }
}

function withCallTiming(
  inner: Agent,
  onCall: (call: AgentCall) => void,
): Agent {
  return {
    reason: async (prompt) => {
      const start = performance.now()
      const verdict = await inner.reason(prompt)
      onCall({ durationMs: performance.now() - start, verdict })
      return verdict
    },
  }
}

type RuleTracker = {
  hooks: EvaluateHooks
  current: () => string | undefined
}

function createRuleTracker(): RuleTracker {
  const state: { current: string | undefined } = { current: undefined }
  return {
    hooks: {
      onRuleStart: (ruleName: string) => {
        state.current = ruleName
      },
      onRuleEnd: () => {
        state.current = undefined
      },
    },
    current: () => state.current,
  }
}

type AgentCallLog = {
  record: (rule: string, call: AgentCall) => void
  callsFor: (rule: string) => readonly AgentCall[]
}

function createAgentCallLog(): AgentCallLog {
  const entries: { rule: string; call: AgentCall }[] = []
  return {
    record: (rule, call) => {
      entries.push({ rule, call })
    },
    callsFor: (rule) =>
      entries.filter((e) => e.rule === rule).map((e) => e.call),
  }
}

function foldAgentCalls(
  trace: readonly TraceEntry[],
  log: AgentCallLog,
): readonly TraceEntry[] {
  return trace.map((entry) => {
    if (entry.kind !== 'rule-evaluated') return entry
    return { ...entry, agentCalls: log.callsFor(entry.rule) }
  })
}
