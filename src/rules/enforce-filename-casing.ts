import { basename } from 'node:path'

import type { Rule, RuleResult } from './contract.js'

/**
 * Supported filename casing styles.
 */
export type Style = 'kebab-case' | 'camelCase' | 'snake_case'

/**
 * Blocks a write whose filename doesn't match the configured casing
 * style. Passes non-write actions through. To scope to specific paths,
 * wrap in a `{ files, rules }` block — block-level `files` is the one
 * path-filtering mechanism, anchored against the config directory.
 *
 * Applies to: write actions.
 * Supported agents: Claude Code, Codex, GitHub Copilot.
 *
 * @example
 * enforceFilenameCasing({ style: 'kebab-case' })
 *
 * @example
 * { files: ['src/**', 'test/**'], rules: [enforceFilenameCasing({ style: 'kebab-case' })] }
 */
export function enforceFilenameCasing(options: { style: Style }): Rule {
  const { style } = options
  return (action) => {
    if (action.kind !== 'write') return pass
    const { path } = action
    if (violations[style](basename(path))) {
      return { kind: 'violation', reason: `${path} does not match ${style}` }
    }
    return pass
  }
}

const pass: RuleResult = { kind: 'pass' }

// kebab-case: no uppercase, no underscores in the filename.
const violatesKebab = (name: string): boolean => /[A-Z_]/.test(name)
/**
 * camelCase: filename must not start with an uppercase letter and must
 * not contain hyphens. Catches PascalCase (`UserProfile.ts`) and
 * kebab-cased filenames.
 */
const violatesCamel = (name: string): boolean =>
  name.includes('-') || /^[A-Z]/.test(name)
// snake_case: no uppercase anywhere in the filename.
const violatesSnake = (name: string): boolean => /[A-Z]/.test(name)

const violations = {
  'kebab-case': violatesKebab,
  camelCase: violatesCamel,
  snake_case: violatesSnake,
} satisfies Record<Style, (name: string) => boolean>
