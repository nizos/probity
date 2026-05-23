import type {
  Action,
  Agent,
  RawSessionEvent,
  RuleResult,
  SessionEvent,
} from '../types.js'

/**
 * Result of a `ctx.readFile` call. `unknown` covers paths the engine
 * refused to surface (symlink, size cap, I/O error); distinct from
 * `absent`, where no file exists at all.
 */
export type FileContent =
  | { kind: 'present'; content: string }
  | { kind: 'absent' }
  | { kind: 'unknown' }

/**
 * The capabilities the engine makes available to rules. All fields are
 * optional at the type level because different adapters supply
 * different subsets. Rules should still null-check before reading.
 */
export type RuleContext = {
  agent?: Agent
  history?: () => Promise<SessionEvent[]>
  rawHistory?: () => Promise<RawSessionEvent[]>
  readFile?: (path: string) => Promise<FileContent>
}

/**
 * A rule as the engine consumes it: a function from Action (+ the
 * engine-provided context) to RuleResult. Rules may be synchronous or
 * asynchronous; the engine awaits the returned value either way. Rule
 * modules export factories of the form `(options) => Rule`.
 */
export type Rule = (
  action: Action,
  ctx?: RuleContext,
) => RuleResult | Promise<RuleResult>
