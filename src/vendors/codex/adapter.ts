import { z } from 'zod'

import type { Action, Decision } from '../../types.js'
import { fromSchema, passthroughFor } from '../adapter.js'
import { posixAbsolute } from '../posix-absolute.js'

/**
 * The JSON shape `toResponse` emits on a block decision. Codex's hook
 * format is documented but not shipped as a type by `@openai/codex-sdk`,
 * so we declare it alongside the function that produces it.
 */
export type ResponseShape = { decision: string; reason: string }

const PATCH_HEADER = /^\*\*\* (?:Add|Update|Delete) File: (.+)$/m

const bashSchema = z.object({
  tool_name: z.literal('Bash'),
  tool_input: z.object({ command: z.string() }),
})

const applyPatchSchema = z.object({
  tool_name: z.literal('apply_patch'),
  tool_input: z.object({ command: z.string() }),
  cwd: z.string().min(1),
})

/**
 * The validated payload shape for an apply_patch tool call. Intersect
 * with the ceremony fields the SDK sends (session_id, turn_id, etc.)
 * when stamping out test payloads so the validated portion tracks the
 * adapter automatically.
 */
export type WriteInput = z.input<typeof applyPatchSchema>

const writeToolsSchema = z.discriminatedUnion('tool_name', [
  bashSchema.transform(
    (d): Action => ({ kind: 'command', command: d.tool_input.command }),
  ),
  applyPatchSchema.transform((d, ctx): Action => {
    const path = PATCH_HEADER.exec(d.tool_input.command)?.[1]
    if (!path) {
      ctx.addIssue({
        code: 'custom',
        message: 'apply_patch: no Add/Update/Delete File header',
      })
      return z.NEVER
    }
    return {
      kind: 'write',
      path: posixAbsolute(d.cwd, path),
      content: d.tool_input.command,
    }
  }),
])

/**
 * Anything Codex fires the hook for that we don't explicitly model
 * (future tools, or a broader user matcher than the recommended
 * `^(Bash|apply_patch|Edit|Write)$`) becomes a no-op command.
 * `passthroughFor` excludes the known tool names so a malformed
 * Bash / apply_patch payload still surfaces as a parse error rather
 * than silently passing through.
 */
const passthroughSchema = passthroughFor('tool_name', ['Bash', 'apply_patch'])

export const parseAction = fromSchema(
  z.union([writeToolsSchema, passthroughSchema]),
)

const ContextPayloadSchema = z.object({ transcript_path: z.string() })

export function sessionPath(payload: unknown): string | undefined {
  const parsed = ContextPayloadSchema.safeParse(payload)
  return parsed.success ? parsed.data.transcript_path : undefined
}

export function toResponse(decision: Decision): string {
  if (decision.kind === 'block') {
    return JSON.stringify({ decision: 'block', reason: decision.reason })
  }
  return ''
}
