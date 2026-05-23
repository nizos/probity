import type { Rule } from './contract.js'
import { stringOrRegexMatches } from './utils/string-or-regex-matches.js'

/**
 * Blocks a write whose content matches `match` — a literal substring or
 * a RegExp. Passes non-write actions through. To scope to specific
 * paths, wrap in a `{ files, rules }` block — block-level `files` is
 * the one path-filtering mechanism, anchored against the config
 * directory.
 *
 * Applies to: write actions.
 * Supported agents: Claude Code, Codex, GitHub Copilot.
 *
 * @example
 * forbidContentPattern({
 *   match: 'setTimeout',
 *   reason: 'Avoid timers in production code',
 * })
 *
 * @example
 * {
 *   files: ['**\/*.md'],
 *   rules: [
 *     forbidContentPattern({
 *       match: /\p{Extended_Pictographic}/u,
 *       reason: 'No emojis in markdown',
 *     }),
 *   ],
 * }
 */
export function forbidContentPattern(options: {
  match: string | RegExp
  reason: string
}): Rule {
  return function forbidContentPattern(action) {
    if (action.kind !== 'write') return { kind: 'pass' }
    if (!stringOrRegexMatches(action.content, options.match)) {
      return { kind: 'pass' }
    }
    return { kind: 'violation', reason: options.reason }
  }
}
