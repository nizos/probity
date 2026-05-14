import { z } from 'zod'

import type { Action, Decision } from '../types.js'

/**
 * Result of parsing a vendor payload into a canonical `Action`. Either
 * the payload was understood (`ok: true`) and yielded an action, or it
 * was malformed (`ok: false`) and the adapter explains why.
 */
export type ParseActionResult =
  | { ok: true; action: Action }
  | { ok: false; reason: string }

/**
 * Wraps a Zod schema as the `parseAction` function the contract
 * requires. Adapters keep their schemas internal and expose
 * `parseAction` via this helper, so consumers don't see Zod's API.
 * Uses `safeParseAsync` so schemas with async transforms (e.g. an
 * Edit transform that reads the current file to compute the full
 * post-edit content) work alongside fully-sync schemas.
 */
export function fromSchema(
  schema: z.ZodType<Action>,
): (payload: unknown) => Promise<ParseActionResult> {
  return async (payload) => {
    const parsed = await schema.safeParseAsync(payload)
    if (parsed.success) return { ok: true, action: parsed.data }
    return {
      ok: false,
      reason: parsed.error.issues.flatMap(unwrapIssue).join('; '),
    }
  }
}

/**
 * `invalid_union` issues hide branch-specific messages under
 * `.errors`; drill in so adapter-emitted messages reach the caller.
 */
function unwrapIssue(issue: z.core.$ZodIssue): string[] {
  if (issue.code === 'invalid_union') {
    return issue.errors.flatMap((branch) => branch.flatMap(unwrapIssue))
  }
  return [issue.message]
}

/**
 * Schema fragment for the "unknown tool name passes through as a
 * no-op command" behavior every adapter needs. The tool-name field
 * varies per vendor (`tool_name` for most, `toolName` for
 * github-copilot), so callers pass it explicitly along with the set
 * of names the adapter recognizes (which the refinement excludes —
 * recognized tools must validate via the discriminated union, not
 * pass through).
 */
export function passthroughFor(
  toolNameField: string,
  knownTools: readonly string[],
): z.ZodType<Action> {
  const known = new Set(knownTools)
  return z
    .object({ [toolNameField]: z.string() })
    .refine((d) => !known.has(d[toolNameField]!))
    .transform((): Action => ({ kind: 'command', command: '' }))
}

/**
 * The contract every adapter implements. Adapters translate
 * vendor-specific hook payloads into a canonical `Action` the engine
 * can evaluate, and translate the engine's `Decision` back into the
 * vendor's expected response format. `sessionPath` is optional —
 * adapters that can locate the agent's session log return its path
 * (e.g. resolved from a `transcript_path` field in the payload, or
 * computed from a `sessionId` plus a vendor home dir). The engine
 * pairs it with the vendor's transcript reader to surface
 * `ctx.rawHistory` to rules.
 */
export type Adapter = {
  parseAction: (payload: unknown) => Promise<ParseActionResult>
  toResponse: (decision: Decision) => string
  sessionPath?: (payload: unknown) => string | undefined
}
