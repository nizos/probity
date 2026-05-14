import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createJiti } from 'jiti'

import type { Agent } from './types.js'
import type { Rule } from './rules/contract.js'

/**
 * A scoped rule block. Groups rules under a shared `files` filter so
 * the same path glob doesn't have to be repeated on each rule.
 * Mirrors the ESLint flat-config shape.
 *
 * - `files` omitted — block applies to every action (same as a flat rule).
 * - `files: [...]` — write actions are filtered by the glob; non-write
 *   actions (commands) pass the block-level filter and rules inside
 *   self-filter by action type. The tuple type forbids an empty array
 *   at the type level (a "match nothing" block would just be dead code).
 */
export type RuleBlock = {
  files?: readonly [string, ...string[]]
  rules: readonly Rule[]
}

/**
 * What a `Config.rules` entry can be: either a flat rule (applies
 * everywhere) or a `RuleBlock` (applies under a `files` filter).
 */
export type RuleEntry = Rule | RuleBlock

/**
 * A project's Probity configuration.
 *
 * - `rules` — the active rules for the session. Entries can be flat
 *   rules or `{ files, rules }` blocks; blocks scope their rules to
 *   write actions whose path matches `files`.
 * - `ai` — optional AI validator to inject into every rule's ctx.
 *   When omitted, the engine uses the validator that pairs with the
 *   selected vendor (e.g. Claude Agent SDK for `claude-code`), which
 *   piggybacks on the user's logged-in session. The field is named
 *   `ai` (not `agent`) to disambiguate from `--agent <vendor>`, which
 *   selects the host coding agent.
 */
export type Config = {
  rules: readonly RuleEntry[]
  ai?: Agent
}

/**
 * Typed identity helper for `probity.config.ts`. Wrap your exported
 * config in this so editors provide autocomplete and type-check the
 * rule list. Has no runtime behavior — it exists solely so the default
 * export is inferred as `Config` without the user typing it.
 *
 * @example
 * import { defineConfig, enforceFilenameCasing } from '@nizos/probity'
 *
 * export default defineConfig({
 *   rules: [enforceFilenameCasing({ style: 'kebab-case' })],
 * })
 */
export function defineConfig(config: Config): Config {
  return config
}

const CONFIG_BASENAME = 'probity.config'
const CONFIG_EXTENSIONS = ['ts', 'mts', 'js', 'mjs'] as const

/**
 * Load a Probity config file (TypeScript or JavaScript) from an absolute
 * path. Returns the default export. Backed by jiti so `.ts` configs run
 * without a build step. Block-level `files` globs are anchored against
 * the config's directory so they match `Action.path` (absolute POSIX)
 * regardless of where the agent's session is rooted.
 */
export async function loadConfig(filepath: string): Promise<Config> {
  const jiti = createJiti(import.meta.url, {
    alias: {
      '@nizos/probity': fileURLToPath(new URL('./index.js', import.meta.url)),
    },
  })
  const module = await jiti.import<{ default: Config }>(filepath)
  const root = path.dirname(filepath)
  return {
    ...module.default,
    rules: module.default.rules.map((entry) => {
      if (typeof entry === 'function' || !entry.files) return entry
      const [first, ...rest] = entry.files.map((glob) => anchorGlob(glob, root))
      return {
        ...entry,
        files: [first!, ...rest] as const,
      }
    }),
  }
}

// `**`-prefixed globs are intentional "match anywhere" patterns; anchoring
// them at the config dir would defeat the user's intent. Negations carry
// the same convention through the `!` prefix.
function anchorGlob(glob: string, root: string): string {
  if (glob.startsWith('!')) return '!' + anchorGlob(glob.slice(1), root)
  if (glob.startsWith('**')) return glob
  return path.posix.join(root, glob)
}

/**
 * Walks up from `startDir` until it finds a `probity.config.{ts,mts,js,mjs}`.
 * Throws with an error that lists the tried extensions if none is found —
 * the bin layer turns that throw into a fail-closed block so missing
 * configs don't silently allow.
 */
export function findConfig(startDir: string): string {
  let dir = startDir
  while (true) {
    for (const ext of CONFIG_EXTENSIONS) {
      const candidate = path.join(dir, `${CONFIG_BASENAME}.${ext}`)
      if (existsSync(candidate)) return candidate
    }
    const parent = path.dirname(dir)
    if (parent === dir) {
      throw new Error(
        `${CONFIG_BASENAME}.{${CONFIG_EXTENSIONS.join(',')}} not found ` +
          `(searched from ${startDir} up to /)`,
      )
    }
    dir = parent
  }
}
