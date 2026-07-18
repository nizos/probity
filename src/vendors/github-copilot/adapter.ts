import { homedir } from 'node:os'
import path from 'node:path'

import { z } from 'zod'

import { attachEditDelta } from '../../edit-delta.js'
import type { Action, Decision } from '../../types.js'
import { JsonString } from '../../utils/json-string.js'
import { fromSchema, passthroughFor } from '../adapter.js'
import { applyEdit } from '../apply-edit.js'
import { posixAbsolute } from '../posix-absolute.js'

/**
 * Matches the SDK's `PreToolUseHookOutput`, which is not exported from
 * the package root.
 */
export type ResponseShape = {
  permissionDecision: string
  permissionDecisionReason: string
}

const bashSchema = z.object({
  toolName: z.literal('bash'),
  toolArgs: JsonString.pipe(z.object({ command: z.string() })),
})

const createSchema = z.object({
  toolName: z.literal('create'),
  toolArgs: JsonString.pipe(
    z.object({ path: z.string(), file_text: z.string() }),
  ),
  cwd: z.string().min(1),
})

const editSchema = z.object({
  toolName: z.literal('edit'),
  toolArgs: JsonString.pipe(
    z.object({
      path: z.string(),
      old_str: z.string(),
      new_str: z.string(),
    }),
  ),
  cwd: z.string().min(1),
})

/**
 * The validated payload shape for a `create` tool call. Intersect with
 * the ceremony fields Copilot sends (sessionId, timestamp) when
 * stamping out test payloads so the validated portion tracks the
 * adapter automatically. `toolArgs` arrives as a JSON string on the
 * wire (parsed by `JsonString.pipe`), so the input shape carries the
 * unparsed string form.
 */
export type WriteInput = z.input<typeof createSchema>

const writeToolsSchema = z.discriminatedUnion('toolName', [
  bashSchema.transform((d): Action => ({
    kind: 'command',
    command: d.toolArgs.command,
  })),
  createSchema.transform((d): Action => ({
    kind: 'write',
    path: posixAbsolute(d.cwd, d.toolArgs.path),
    content: d.toolArgs.file_text,
  })),
  editSchema.transform(async (d, ctx): Promise<Action> => {
    const filePath = posixAbsolute(d.cwd, d.toolArgs.path)
    const result = await applyEdit({
      filePath,
      oldString: d.toolArgs.old_str,
      newString: d.toolArgs.new_str,
    })
    if (!result.ok) {
      ctx.addIssue({ code: 'custom', message: result.reason })
      return z.NEVER
    }
    return attachEditDelta(
      { kind: 'write', path: filePath, content: result.content },
      result.delta,
    )
  }),
])

/**
 * Anything Copilot fires the hook for that we don't explicitly model
 * (view, report_intent, future tools, etc.) becomes a no-op command.
 * `passthroughFor` excludes the known tool names so a malformed
 * `bash` / `create` / `edit` payload still surfaces as a parse error
 * rather than silently passing through.
 */
const passthroughSchema = passthroughFor('toolName', ['bash', 'create', 'edit'])

export const parseAction = fromSchema(
  z.union([writeToolsSchema, passthroughSchema]),
)

const ContextPayloadSchema = z.object({
  sessionId: z.string().regex(/^[A-Za-z0-9_-]+$/, {
    message: 'sessionId must be a safe identifier (no path separators)',
  }),
})

export function sessionPath(payload: unknown): string | undefined {
  const parsed = ContextPayloadSchema.safeParse(payload)
  if (!parsed.success) return undefined
  const home = process.env.COPILOT_HOME ?? path.join(homedir(), '.copilot')
  return path.join(home, 'session-state', parsed.data.sessionId, 'events.jsonl')
}

export function toResponse(decision: Decision): string {
  if (decision.kind === 'block') {
    return JSON.stringify({
      permissionDecision: 'deny',
      permissionDecisionReason: decision.reason,
    })
  }
  // Allow = "no opinion": empty stdout keeps Copilot's normal flow and
  // built-in confirmations intact. Today only `deny` is acted on, but
  // emitting `allow` would silently grant permission once Copilot starts
  // honoring it.
  return ''
}
