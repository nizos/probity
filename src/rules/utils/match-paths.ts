import picomatch from 'picomatch'

import type { Action } from '../../types.js'
import { canonicalizePath } from '../../utils/canonicalize-path.js'

/**
 * Builds a path matcher from include/exclude patterns. Patterns prefixed
 * with `!` are negations (carried into picomatch's `ignore` option);
 * everything else is an include. An all-negations list matches nothing
 * positively, so `**` is supplied as the default include when only
 * negations are given.
 *
 * `dot: true` so `*` / `**` traverse dot-prefixed segments: without it a
 * `files`-scoped rule silently skips dotfiles (`.env`, `.github/**`,
 * `.eslintrc.js`) — a fail-open where a write that should be checked
 * slips through. picomatch applies the option to the `ignore` matcher
 * too, so negations stay dot-aware.
 */
export function buildMatcher(patterns: string[]): (path: string) => boolean {
  if (patterns.length === 0) return () => false
  const includes = patterns.filter((p) => !p.startsWith('!'))
  const ignore = patterns
    .filter((p) => p.startsWith('!'))
    .map((p) => p.slice(1))
  const matcher = picomatch(includes.length ? includes : '**', {
    dot: true,
    ignore,
  })
  return (path) => matcher(path)
}

/**
 * Whether a `{ files, rules }` block applies to an action. Empty `files`
 * matches nothing (runtime defense; the type forbids it). Non-write
 * actions pass the block-level filter and self-filter inside their
 * rules. Write actions are matched against `files` via `buildMatcher`.
 *
 * A write is tried both as reported and symlink-resolved, since the same
 * file can arrive under either name. Trying both stops a rule from
 * skipping the file, and keeps a symlink that points out of the project
 * in scope — including a workspace symlink (e.g. a linked package under
 * node_modules) that resolves into an included directory even though
 * the reported path also matches a vendor-directory exclusion. Fail-open
 * is the risk this exists to close, so a path is only out of scope when
 * BOTH spellings agree it's excluded.
 */
export function actionMatchesFilesScope(
  files: readonly string[],
  action: Action,
  canonicalize: (p: string) => string = canonicalizePath,
): boolean {
  if (files.length === 0) return false
  if (action.kind !== 'write') return true
  const matches = buildMatcher([...files])
  return matches(action.path) || matches(canonicalize(action.path))
}
