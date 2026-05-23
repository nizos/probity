import { z } from 'zod'

import type { Action, Decision } from '../../types.js'
import { fromSchema, passthroughFor } from '../adapter.js'
import { applyEdit } from '../apply-edit.js'
import { posixAbsolute } from '../posix-absolute.js'

export function toResponse(decision: Decision): string {
  if (decision.kind === 'block') {
    return JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: decision.reason,
      },
    })
  }
  return ''
}

const runInTerminalSchema = z.object({
  tool_name: z.literal('run_in_terminal'),
  tool_input: z.object({ command: z.string() }),
})

const createFileSchema = z.object({
  tool_name: z.literal('create_file'),
  tool_input: z.object({ filePath: z.string(), content: z.string() }),
  cwd: z.string().min(1),
})

const replaceStringInFileSchema = z.object({
  tool_name: z.literal('replace_string_in_file'),
  tool_input: z.object({
    filePath: z.string(),
    oldString: z.string(),
    newString: z.string(),
  }),
  cwd: z.string().min(1),
})

/**
 * The validated payload shape for a create_file tool call. Intersect
 * with the ceremony fields the Chat extension sends (session_id,
 * timestamp, etc.) when stamping out test payloads so the validated
 * portion tracks the adapter automatically.
 */
export type WriteInput = z.input<typeof createFileSchema>

const writeToolsSchema = z.discriminatedUnion('tool_name', [
  runInTerminalSchema.transform(
    (d): Action => ({ kind: 'command', command: d.tool_input.command }),
  ),
  createFileSchema.transform(
    (d): Action => ({
      kind: 'write',
      path: posixAbsolute(d.cwd, d.tool_input.filePath),
      content: d.tool_input.content,
    }),
  ),
  replaceStringInFileSchema.transform(async (d, ctx): Promise<Action> => {
    const filePath = posixAbsolute(d.cwd, d.tool_input.filePath)
    const result = await applyEdit({
      filePath,
      oldString: d.tool_input.oldString,
      newString: d.tool_input.newString,
    })
    if (!result.ok) {
      ctx.addIssue({ code: 'custom', message: result.reason })
      return z.NEVER
    }
    return { kind: 'write', path: filePath, content: result.content }
  }),
])

/**
 * Anything we don't explicitly recognise (read_file, list_dir,
 * grep_search, future tools, etc.) becomes a no-op command: no rule
 * matches it, the engine returns allow. The Chat extension fires the
 * hook for every tool call, so silently passing through unknown tools
 * is what keeps the surface usable. `passthroughFor` excludes the
 * known tool names so a malformed run_in_terminal / create_file /
 * replace_string_in_file payload still surfaces as a parse error.
 */
const passthroughSchema = passthroughFor('tool_name', [
  'run_in_terminal',
  'create_file',
  'replace_string_in_file',
])

export const parseAction = fromSchema(
  z.union([writeToolsSchema, passthroughSchema]),
)

const ContextPayloadSchema = z.object({ transcript_path: z.string() })

export function sessionPath(payload: unknown): string | undefined {
  const parsed = ContextPayloadSchema.safeParse(payload)
  return parsed.success ? parsed.data.transcript_path : undefined
}
