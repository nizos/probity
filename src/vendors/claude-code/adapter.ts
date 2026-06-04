import type { PreToolUseHookSpecificOutput } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

import type { Action, Decision } from '../../types.js'
import { fromSchema, passthroughFor } from '../adapter.js'
import { applyEdit } from '../apply-edit.js'
import { posixAbsolute } from '../posix-absolute.js'

/**
 * The JSON shape `toResponse` emits on a block decision. Tests parsing
 * the response stream against this canonical shape catch drift if the
 * adapter ever changes its output.
 */
export type ResponseShape = {
  hookSpecificOutput: PreToolUseHookSpecificOutput
}

const bashSchema = z.object({
  tool_name: z.literal('Bash'),
  tool_input: z.object({ command: z.string() }),
})

const editSchema = z.object({
  tool_name: z.literal('Edit'),
  tool_input: z.object({
    file_path: z.string(),
    old_string: z.string(),
    new_string: z.string(),
    replace_all: z.boolean().default(false),
  }),
  cwd: z.string().min(1),
})

const writeSchema = z.object({
  tool_name: z.literal('Write'),
  tool_input: z.object({
    file_path: z.string(),
    content: z.string(),
  }),
  cwd: z.string().min(1),
})

/**
 * The validated payload shape for a Write tool call. Intersect with the
 * ceremony fields the SDK sends (session_id, transcript_path, etc.)
 * when stamping out test payloads so the validated portion tracks the
 * adapter automatically.
 */
export type WriteInput = z.input<typeof writeSchema>

/**
 * NotebookEdit replaces, inserts, or deletes one cell of a `.ipynb`.
 * We surface it as a write whose content is the cell's `new_source` —
 * the text the agent is adding — so content rules and enforceTdd see
 * exactly what's being introduced. (Reconstructing the whole notebook
 * JSON would be faithful to disk but adds nothing the rules can use.)
 */
const notebookEditSchema = z.object({
  tool_name: z.literal('NotebookEdit'),
  tool_input: z.object({
    notebook_path: z.string(),
    new_source: z.string(),
  }),
  cwd: z.string().min(1),
})

const writeToolsSchema = z.discriminatedUnion('tool_name', [
  bashSchema.transform(
    (d): Action => ({ kind: 'command', command: d.tool_input.command }),
  ),
  editSchema.transform(async (d, ctx): Promise<Action> => {
    const path = posixAbsolute(d.cwd, d.tool_input.file_path)
    const result = await applyEdit({
      filePath: path,
      oldString: d.tool_input.old_string,
      newString: d.tool_input.new_string,
      replaceAll: d.tool_input.replace_all,
    })
    if (!result.ok) {
      ctx.addIssue({ code: 'custom', message: result.reason })
      return z.NEVER
    }
    return { kind: 'write', path, content: result.content }
  }),
  writeSchema.transform(
    (d): Action => ({
      kind: 'write',
      path: posixAbsolute(d.cwd, d.tool_input.file_path),
      content: d.tool_input.content,
    }),
  ),
  notebookEditSchema.transform(
    (d): Action => ({
      kind: 'write',
      path: posixAbsolute(d.cwd, d.tool_input.notebook_path),
      content: d.tool_input.new_source,
    }),
  ),
])

/**
 * Anything Claude Code fires the hook for that we don't explicitly
 * model (Read, Grep, future tools) becomes a no-op command: no rule
 * matches it, the engine returns allow. `passthroughFor` excludes the
 * known tool names so a malformed Bash / Edit / Write / NotebookEdit
 * payload still surfaces as a parse error rather than silently passing
 * through.
 */
const passthroughSchema = passthroughFor('tool_name', [
  'Bash',
  'Edit',
  'Write',
  'NotebookEdit',
])

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
    return JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: decision.reason,
      },
    })
  }
  // Allow = "no opinion": empty stdout + exit 0 lets Claude Code's normal
  // permission flow take over. Returning permissionDecision: 'allow' would
  // skip the user's confirmation prompt for every non-blocked action.
  return ''
}
