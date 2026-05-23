import type { Rule } from './contract.js'
import { stringOrRegexMatches } from './utils/string-or-regex-matches.js'

/**
 * Blocks a command whose text matches `match` — a literal substring or
 * a RegExp. Passes non-command actions and non-matching commands
 * through.
 *
 * Applies to: command actions (bash / shell tool calls).
 * Supported agents: Claude Code, Codex, GitHub Copilot.
 *
 * @example
 * forbidCommandPattern({
 *   match: 'npm install',
 *   reason: 'Use pnpm install instead',
 * })
 *
 * @example
 * forbidCommandPattern({
 *   match: /rm\s+-rf/,
 *   reason: 'Avoid destructive rm',
 * })
 */
export function forbidCommandPattern(options: {
  match: string | RegExp
  reason: string
}): Rule {
  return function forbidCommandPattern(action) {
    if (action.kind !== 'command') return { kind: 'pass' }
    if (!stringOrRegexMatches(action.command, options.match)) {
      return { kind: 'pass' }
    }
    return { kind: 'violation', reason: options.reason }
  }
}
