import type { RuleEntry } from './config.js'
import type {
  Action,
  Decision,
  Outcome,
  RuleResult,
  TraceEntry,
} from './types.js'
import type { Rule, RuleContext } from './rules/contract.js'
import { actionMatchesFilesScope } from './rules/utils/match-paths.js'

/**
 * Capability-agnostic lifecycle hooks the engine emits around each
 * rule call. Concrete observers (e.g. cli's agent-call collector)
 * subscribe at the composition root; the engine doesn't know what
 * they do with the events. Both hooks fire even if the rule throws
 * or the engine short-circuits on a violation.
 */
export type EvaluateHooks = {
  onRuleStart?: (ruleName: string) => void
  onRuleEnd?: (ruleName: string) => void
}

/**
 * Run rules against an action and return the engine's Outcome. The
 * violator's trace entry is pushed before the engine short-circuits,
 * so the trace ends with the rule that caused the block. Fail-closed:
 * a thrown rule becomes a block decision rather than an unhandled
 * rejection.
 */
export async function evaluate(
  action: Action,
  entries: readonly RuleEntry[],
  ctx?: RuleContext,
  hooks?: EvaluateHooks,
): Promise<Outcome> {
  const trace: TraceEntry[] = []
  for (const entry of entries) {
    for (const rule of resolveRules(entry, action)) {
      const step = await runRule(rule, action, ctx, hooks)
      trace.push(step.traceEntry)
      if (step.decision) return { decision: step.decision, trace }
    }
  }
  return { decision: { kind: 'allow' }, trace }
}

async function runRule(
  rule: Rule,
  action: Action,
  ctx: RuleContext | undefined,
  hooks: EvaluateHooks | undefined,
): Promise<{ traceEntry: TraceEntry; decision?: Decision }> {
  const ruleName = rule.name || '(unnamed)'
  hooks?.onRuleStart?.(ruleName)
  const start = performance.now()
  try {
    const result: unknown = await rule(action, ctx)
    if (!isRuleResult(result)) {
      throw new Error(
        'invalid rule result: expected kind "pass" or "violation"',
      )
    }
    const durationMs = performance.now() - start
    const traceEntry: TraceEntry = {
      kind: 'rule-evaluated',
      rule: ruleName,
      result,
      durationMs,
    }
    if (result.kind === 'violation') {
      return { traceEntry, decision: { kind: 'block', reason: result.reason } }
    }
    return { traceEntry }
  } catch (error) {
    const durationMs = performance.now() - start
    const reason = error instanceof Error ? error.message : String(error)
    return {
      traceEntry: { kind: 'rule-threw', rule: ruleName, reason, durationMs },
      decision: { kind: 'block', reason: `rule error: ${reason}` },
    }
  } finally {
    hooks?.onRuleEnd?.(ruleName)
  }
}

function isRuleResult(result: unknown): result is RuleResult {
  if (!result || typeof result !== 'object') return false
  const kind = (result as { kind?: unknown }).kind
  if (kind === 'pass') return true
  return (
    kind === 'violation' &&
    typeof (result as { reason?: unknown }).reason === 'string'
  )
}

function resolveRules(entry: RuleEntry, action: Action): readonly Rule[] {
  if (typeof entry === 'function') return [entry]
  if (entry.files && !actionMatchesFilesScope(entry.files, action)) return []
  return entry.rules
}
