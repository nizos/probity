import { z } from 'zod'

import type { Action, Decision } from '../../types.js'
import { fromSchema, passthroughFor } from '../adapter.js'
import { applyEdit } from '../apply-edit.js'
import { posixAbsolute } from '../posix-absolute.js'

/**
 * The JSON shape `toResponse` emits on a block decision. Matches the
 * Codex-style flat format: `{ decision, reason }`.
 */
export type ResponseShape = { decision: string; reason: string }

const bashSchema = z.object({
  tool: z.literal('Bash'),
  args: z.object({ command: z.string() }),
})

const writeSchema = z.object({
  tool: z.literal('Write'),
  args: z.object({
    filePath: z.string(),
    content: z.string(),
  }),
  cwd: z.string().min(1),
})

const editSchema = z.object({
  tool: z.literal('Edit'),
  args: z.object({
    filePath: z.string(),
    oldString: z.string(),
    newString: z.string(),
  }),
  cwd: z.string().min(1),
})

/**
 * The validated payload shape for a Write tool call. Intersect with the
 * ceremony fields the plugin sends (sessionID, callID, etc.) when
 * stamping out test payloads so the validated portion tracks the adapter
 * automatically.
 */
export type WriteInput = z.input<typeof writeSchema>

const writeToolsSchema = z.discriminatedUnion('tool', [
  bashSchema.transform((d): Action => ({
    kind: 'command',
    command: d.args.command,
  })),
  writeSchema.transform((d): Action => ({
    kind: 'write',
    path: posixAbsolute(d.cwd, d.args.filePath),
    content: d.args.content,
  })),
  editSchema.transform(async (d, ctx): Promise<Action> => {
    const path = posixAbsolute(d.cwd, d.args.filePath)
    const result = await applyEdit({
      filePath: path,
      oldString: d.args.oldString,
      newString: d.args.newString,
    })
    if (!result.ok) {
      ctx.addIssue({ code: 'custom', message: result.reason })
      return z.NEVER
    }
    return { kind: 'write', path, content: result.content }
  }),
])

/**
 * Anything OpenCode fires the hook for that we don't explicitly model
 * (Read, Grep, Glob, future tools) becomes a no-op command: no rule
 * matches it, the engine returns allow. `passthroughFor` excludes the
 * known tool names so a malformed Bash / Write / Edit payload still
 * surfaces as a parse error rather than silently passing through.
 */
const passthroughSchema = passthroughFor('tool', ['Bash', 'Write', 'Edit'])

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
  // Allow = "no opinion": empty stdout + exit 0 lets the plugin's
  // normal flow proceed without blocking.
  return ''
}
