import picomatch from 'picomatch'

import type { Action } from '../../types.js'

/**
 * Builds a path matcher from include/exclude patterns. Patterns prefixed
 * with `!` are negations (carried into picomatch's `ignore` option);
 * everything else is an include. An all-negations list matches nothing
 * positively, so `**` is supplied as the default include when only
 * negations are given.
 */
export function buildMatcher(patterns: string[]): (path: string) => boolean {
  if (patterns.length === 0) return () => false
  const includes = patterns.filter((p) => !p.startsWith('!'))
  const ignore = patterns
    .filter((p) => p.startsWith('!'))
    .map((p) => p.slice(1))
  const matcher = picomatch(includes.length ? includes : '**', { ignore })
  return (path) => matcher(path)
}

/**
 * Whether a `{ files, rules }` block applies to an action. Empty `files`
 * matches nothing (runtime defense; the type forbids it). Non-write
 * actions pass the block-level filter and self-filter inside their
 * rules. Write actions are matched against `files` via `buildMatcher`.
 */
export function actionMatchesFilesScope(
  files: readonly string[],
  action: Action,
): boolean {
  if (files.length === 0) return false
  if (action.kind !== 'write') return true
  return buildMatcher([...files])(action.path)
}
