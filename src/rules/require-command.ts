import type { SessionEvent } from '../types.js'
import type { Rule } from './contract.js'
import { stringOrRegexMatches } from './utils/string-or-regex-matches.js'

type CommandMatcher = { kind: 'command'; match: string | RegExp }
type AfterFilter =
  | { kind: 'write' }
  | { kind: 'command'; match?: string | RegExp }

type Options = {
  before: CommandMatcher
  command: string | RegExp
  after?: AfterFilter
  reason?: string
}

/**
 * Gates a command action on a prior command appearing in canonical
 * session history. By default the required command must be the most
 * recent event; the optional `after` filter relaxes this by naming the
 * events that invalidate the required command if they appear after it.
 *
 * Applies to: command actions.
 * Supported agents: Claude Code, Codex, GitHub Copilot.
 *
 * @param options.before — which actions this rule gates. Only commands
 *   whose text matches `before.match` (literal substring or RegExp) are
 *   evaluated; everything else passes through.
 * @param options.command — the prior command pattern that must satisfy
 *   the gate. Matched against the canonical session-history command
 *   events (literal substring or RegExp).
 * @param options.after — what invalidates the required command if it
 *   appears in history after the most recent matching command. Without
 *   `after`, any event after the required command invalidates it (i.e.
 *   the required command must be the most recent event). With `after:
 *   { kind: 'write' }`, only writes invalidate. With `after: { kind:
 *   'command', match: /.../ }`, only commands matching the pattern
 *   invalidate (omit `match` to invalidate on any command).
 * @param options.reason — custom block message. Defaults to an
 *   auto-generated message naming the required pattern.
 *
 * @example
 * // Block commits unless `npm run lint` was the most recent event.
 * requireCommand({
 *   before: { kind: 'command', match: /git commit/ },
 *   command: /npm run lint/,
 * })
 *
 * @example
 * // Allow non-write events between lint and commit;
 * // a write since lint invalidates the gate.
 * requireCommand({
 *   before: { kind: 'command', match: /git commit/ },
 *   command: /npm run lint/,
 *   after: { kind: 'write' },
 *   reason: 'Run lint after every change before committing.',
 * })
 */
export function requireCommand(options: Options): Rule {
  return async function requireCommand(action, ctx) {
    if (action.kind !== options.before.kind) return { kind: 'pass' }
    if (!stringOrRegexMatches(action.command, options.before.match)) {
      return { kind: 'pass' }
    }
    const violation = {
      kind: 'violation' as const,
      reason: options.reason ?? defaultReason(options.command),
    }
    const history = (await ctx?.history?.()) ?? []
    const lastIdx = lastIndexOfCommand(history, options.command)
    if (lastIdx === -1) return violation
    for (let i = lastIdx + 1; i < history.length; i++) {
      const event = history[i]
      if (event && invalidates(event, options.after)) return violation
    }
    return { kind: 'pass' }
  }
}

function invalidates(event: SessionEvent, filter: AfterFilter | undefined) {
  if (!filter) return true
  if (filter.kind === 'write') return event.kind === 'write'
  if (event.kind !== 'command') return false
  if (filter.match === undefined) return true
  return stringOrRegexMatches(event.command, filter.match)
}

function lastIndexOfCommand(
  history: readonly SessionEvent[],
  match: string | RegExp,
): number {
  for (let i = history.length - 1; i >= 0; i--) {
    const event = history[i]
    if (
      event?.kind === 'command' &&
      stringOrRegexMatches(event.command, match)
    ) {
      return i
    }
  }
  return -1
}

function defaultReason(command: string | RegExp): string {
  const formatted =
    typeof command === 'string' ? `"${command}"` : command.toString()
  return `requireCommand: required prior command pattern ${formatted} did not satisfy the gate before this action.`
}
