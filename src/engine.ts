import type { RuleEntry } from './config.js'
import type {
  Action,
  Decision,
  Outcome,
  RuleResult,
  TraceEntry,
} from './types.js'
import { isRuleResult, type Rule, type RuleContext } from './rules/contract.js'
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
 * a rule that throws or returns a value off the pass/violation contract
 * becomes a block decision rather than an unhandled rejection or a
 * silent allow.
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

type RuleStep = { traceEntry: TraceEntry; decision?: Decision }

async function runRule(
  rule: Rule,
  action: Action,
  ctx: RuleContext | undefined,
  hooks: EvaluateHooks | undefined,
): Promise<RuleStep> {
  const ruleName = rule.name || '(unnamed)'
  const start = performance.now()
  hooks?.onRuleStart?.(ruleName)
  try {
    const result: unknown = await rule(action, ctx)
    const durationMs = elapsed(start)
    return isRuleResult(result)
      ? evaluated(ruleName, result, durationMs)
      : failed(
          ruleName,
          'returned a result outside the pass/violation contract',
          durationMs,
        )
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return failed(ruleName, reason, elapsed(start))
  } finally {
    hooks?.onRuleEnd?.(ruleName)
  }
}

/**
 * Builds the step for a rule that returned a usable result: a violation
 * blocks (forwarding its reason), a pass does not. The switch is left
 * without a default so a future RuleResult kind makes it non-exhaustive
 * and this fails to compile rather than silently allowing.
 */
function evaluated(
  rule: string,
  result: RuleResult,
  durationMs: number,
): RuleStep {
  const traceEntry: TraceEntry = {
    kind: 'rule-evaluated',
    rule,
    result,
    durationMs,
  }
  switch (result.kind) {
    case 'violation':
      return { traceEntry, decision: block(result.reason) }
    case 'pass':
      return { traceEntry }
  }
}

/**
 * Builds the fail-closed step for a rule that did not yield a usable
 * result: it threw, or returned a value off the pass/violation
 * contract. `reason` carries which.
 */
function failed(rule: string, reason: string, durationMs: number): RuleStep {
  return {
    traceEntry: { kind: 'rule-failed', rule, reason, durationMs },
    decision: block(`rule error: ${reason}`),
  }
}

function block(reason: string): Decision {
  return { kind: 'block', reason }
}

function elapsed(start: number): number {
  return performance.now() - start
}

function resolveRules(entry: RuleEntry, action: Action): readonly Rule[] {
  if (typeof entry === 'function') return [entry]
  if (entry.files && !actionMatchesFilesScope(entry.files, action)) return []
  return entry.rules
}
