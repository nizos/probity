import { z } from 'zod'

import type { Action, Decision } from '../../types.js'
import { fromSchema, passthroughFor } from '../adapter.js'
import { applyEdit } from '../apply-edit.js'
import { posixAbsolute } from '../posix-absolute.js'

const runCommandSchema = z.object({
  tool_name: z.literal('run_command'),
  tool_input: z.object({ CommandLine: z.string() }),
})

const writeFileSchema = z.object({
  tool_name: z.literal('write_to_file'),
  tool_input: z.object({ TargetFile: z.string(), CodeContent: z.string() }),
  cwd: z.string().min(1),
})

const replaceSchema = z.object({
  tool_name: z.literal('replace_file_content'),
  tool_input: z.object({
    TargetFile: z.string(),
    TargetContent: z.string(),
    ReplacementContent: z.string(),
    AllowMultiple: z.boolean().default(false),
  }),
  cwd: z.string().min(1),
})

const writeToolsSchema = z.discriminatedUnion('tool_name', [
  runCommandSchema.transform(
    (d): Action => ({ kind: 'command', command: d.tool_input.CommandLine }),
  ),
  writeFileSchema.transform(
    (d): Action => ({
      kind: 'write',
      path: posixAbsolute(d.cwd, d.tool_input.TargetFile),
      content: d.tool_input.CodeContent,
    }),
  ),
  replaceSchema.transform(async (d, ctx): Promise<Action> => {
    const path = posixAbsolute(d.cwd, d.tool_input.TargetFile)
    const result = await applyEdit({
      filePath: path,
      oldString: d.tool_input.TargetContent,
      newString: d.tool_input.ReplacementContent,
      replaceAll: d.tool_input.AllowMultiple,
    })
    if (!result.ok) {
      ctx.addIssue({ code: 'custom', message: result.reason })
      return z.NEVER
    }
    return { kind: 'write', path, content: result.content }
  }),
])

/**
 * Anything Antigravity fires the hook for that we don't model (reads
 * like list_dir / grep_search / view_file, or future tools) becomes a
 * no-op command the engine allows. `passthroughFor` excludes the known
 * tool names so a malformed run_command / write_to_file /
 * replace_file_content payload still surfaces as a parse error.
 */
const passthroughSchema = passthroughFor('tool_name', [
  'run_command',
  'write_to_file',
  'replace_file_content',
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
    return JSON.stringify({ decision: 'block', reason: decision.reason })
  }
  // Allow = no opinion: empty stdout lets Antigravity's normal flow proceed.
  return ''
}
