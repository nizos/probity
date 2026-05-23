import type { RuleEntry } from './config.js'
import type { Action, Decision } from './types.js'
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
 * Run rules against an action, returning the first violation as a block
 * decision or allow if none object. Fail-closed: a rule that throws
 * becomes a block decision with the error message rather than escaping
 * as an unhandled rejection. Entries may be flat rules or
 * `{ files, rules }` blocks; blocks whose `files` glob doesn't match
 * the action's path are skipped.
 */
export async function evaluate(
  action: Action,
  entries: readonly RuleEntry[],
  ctx?: RuleContext,
): Promise<Decision> {
  try {
    for (const entry of entries) {
      for (const rule of resolveRules(entry, action)) {
        const result = await rule(action, ctx)
        if (result.kind === 'violation') {
          return { kind: 'block', reason: result.reason }
        }
      }
    }
    return { kind: 'allow' }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return { kind: 'block', reason: `rule error: ${reason}` }
  }
}

function resolveRules(entry: RuleEntry, action: Action): readonly Rule[] {
  if (typeof entry === 'function') return [entry]
  if (entry.files && !actionMatchesFilesScope(entry.files, action)) return []
  return entry.rules
}
