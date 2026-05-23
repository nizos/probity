/**
 * The outcome of a rule evaluating an action.
 *
 * - `pass` — no violation; the rule has no objection. Optional `notes`
 *   carry structured context (e.g. a fast-path signal) for the
 *   operator trace; the host agent never sees them.
 * - `violation` — the rule objects; `reason` is surfaced to the agent.
 */
export type RuleResult =
  | {
      kind: 'pass'
      reason?: string
      notes?: readonly { kind: string }[]
    }
  | { kind: 'violation'; reason: string }

/**
 * Canonical action an agent attempts, as seen by rules and the engine.
 * Adapters translate vendor-specific hook payloads into this shape.
 *
 * - `write` — a file write or edit. `path` is absolute POSIX
 *   (adapters resolve it against the payload `cwd`). The engine
 *   relativizes against the config root at match time, so rule globs
 *   can be authored as `'src/**'` against the project root. Rules that
 *   read the file from disk can pass `path` straight to `fs.open`.
 * - `command` — a shell command invocation; carries the command text.
 */
export type Action =
  | { kind: 'write'; path: string; content: string }
  | { kind: 'command'; command: string }

/**
 * The engine's decision after evaluating rules against an action.
 *
 * - `allow` — no rule objected; the action may proceed.
 * - `block` — a rule objected; `reason` is surfaced back to the agent
 *   via its adapter's response format.
 */
export type Decision = { kind: 'allow' } | { kind: 'block'; reason: string }

/**
 * The engine's full output: the Decision sent over the wire plus a
 * structured trace of how the decision was reached.
 */
export type Outcome = {
  decision: Decision
  trace: readonly TraceEntry[]
}

/**
 * An entry in the engine's trace.
 *
 * - `rule-evaluated` — a rule ran and returned a result; the entry is
 *   pushed even for the violator that triggers a short-circuit.
 *   Optional `agentCalls` records AI validator calls the rule made
 *   during its run; captured by an external observer subscribed to
 *   the engine's lifecycle hooks, not by the rule itself.
 * - `rule-threw` — a rule threw an exception; the engine fail-closes
 *   to a block decision, and this entry attributes the throw.
 * - `parse-failed` — the cli's parse layer rejected the payload before
 *   the engine ran; no rule was evaluated.
 */
export type TraceEntry =
  | {
      kind: 'rule-evaluated'
      rule: string
      result: RuleResult
      durationMs: number
      agentCalls?: readonly AgentCall[]
    }
  | { kind: 'rule-threw'; rule: string; reason: string; durationMs: number }
  | { kind: 'parse-failed'; reason: string }

/**
 * A recorded AI validator invocation. `durationMs` is the wall-clock
 * measured by the observer at the call site; the embedded `verdict`
 * carries the call's kind, reason, and any vendor-normalized telemetry
 * the agent attached as `AgentMeta`.
 */
export type AgentCall = {
  durationMs: number
  verdict: Verdict
}

/**
 * Vendor-normalized SDK telemetry attached to a Verdict. All fields
 * optional because not every SDK exposes every value (Copilot reports
 * less than Anthropic, for example). Token field names follow
 * Anthropic's convention (`inputTokens` / `outputTokens`); per-vendor
 * agents translate from their SDK's native names.
 */
export type AgentMeta = {
  model?: string
  inputTokens?: number
  outputTokens?: number
}

/**
 * What an AI validator returns. Optional `meta` carries vendor-normalized
 * telemetry the cli-side observer surfaces onto the trace; rules don't
 * forward it themselves.
 */
export type Verdict = {
  kind: 'pass' | 'violation'
  reason: string
  meta?: AgentMeta
}

/**
 * The minimal AI-validator contract. Rules that need LLM judgment reach
 * for `ctx.agent.reason(prompt)`; agents implement this one method and
 * are swappable without touching rule code.
 */
export type Agent = {
  reason: (prompt: string) => Promise<Verdict>
}

/**
 * A vendor-shaped event from the agent's recent session — what the
 * agent asked, did, and saw, with the original tool name and input
 * preserved. Adapters translate vendor-specific transcripts into this
 * shape. Rules that need vendor fidelity consume it via
 * `ctx.rawHistory()`; canonical, domain-shaped events live elsewhere.
 */
export type RawSessionEvent =
  | { kind: 'prompt'; text: string }
  | {
      kind: 'action'
      tool: string
      input: unknown
      output: string
      toolUseId: string
    }

/**
 * The canonical, domain-shaped event a rule sees. Adapters classify
 * each `RawSessionEvent` into one of these so rules can reason about
 * "a command ran" or "a write happened" without knowing per-vendor tool
 * names.
 */
export type SessionEvent =
  | { kind: 'prompt'; text: string }
  | { kind: 'command'; command: string; output: string }
  | { kind: 'write'; path: string; content: string; output: string }
  | { kind: 'other'; tool: string; input: unknown; output: string }
